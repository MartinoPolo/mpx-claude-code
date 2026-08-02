/*
 * Writes the Windows Terminal tab title on behalf of a Claude Code hook, and
 * animates it while a turn is running.
 *
 *   terminal-title-state.exe idle "<title>"     stop the spinner, show <title>
 *   terminal-title-state.exe busy "<title>"     spin "<frame> <title>" until idle
 *   terminal-title-state.exe --worker <pid> "<title>"   internal: the ticker
 *
 * scripts/terminal-title.mts composes <title> and invokes this; see that file
 * for why the account prefix and the worktree name are shaped the way they are.
 *
 * Why a compiled helper exists at all. A hook cannot reach the tab by any
 * ordinary route: its stdout is a pipe Claude Code reads (on UserPromptSubmit
 * that pipe is appended to the model's prompt, so an OSC escape written there
 * lands in the transcript), and Claude Code spawns hooks with a console of their
 * own -- GetConsoleWindow() == 0, one process attached, the default executable
 * name as the title. SetConsoleTitleW from a hook therefore succeeds against a
 * throwaway console destroyed milliseconds later, which is exactly why the first
 * working version showed nothing in the tab.
 *
 * So the hook borrows the terminal's console: walk up the ancestry to the
 * `claude` process the terminal is actually hosting, AttachConsole to it, and
 * SetConsoleTitleW there. ConPTY turns that title change into the OSC 0 the tab
 * reads. C rather than the PowerShell this replaces because FreeConsole and
 * AttachConsole have no .NET wrapper, so every PowerShell invocation recompiled
 * a C# interop shim: 284ms of a 510ms hook, against ~2ms here.
 */

#include <windows.h>
#include <tlhelp32.h>
#include <wchar.h>

/* node -> bash -> claude is the deepest chain observed; the bound only stops a
 * malformed ancestry (a reparented orphan) from walking to init. */
#define MAX_ANCESTRY_DEPTH 12
#define SPINNER_INTERVAL_MS 100
#define WORKER_HANDOFF_TIMEOUT_MS 2000

/* Braille cell, the same shape Claude Code's own spinner used: narrow enough not
 * to cost the title real width, and it renders in text presentation, so it takes
 * the tab's foreground colour instead of becoming an emoji block. */
static const wchar_t *const SPINNER_FRAMES[] = {
    L"⠋", L"⠙", L"⠹", L"⠸", L"⠼",
    L"⠴", L"⠦", L"⠧", L"⠇", L"⠏",
};
static const int SPINNER_FRAME_COUNT = 10;

/* Per-console rather than global: every tab runs its own claude, and one
 * session's Stop must not stop another session's spinner. */
static void build_sync_name(wchar_t *out, size_t capacity, const wchar_t *suffix, DWORD consoleProcessId) {
    _snwprintf_s(out, capacity, _TRUNCATE, L"Local\\ClaudeTerminalTitle%ls_%lu", suffix, consoleProcessId);
}

static DWORD parent_process_id(DWORD processId) {
    HANDLE snapshot = CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0);
    if (snapshot == INVALID_HANDLE_VALUE) {
        return 0;
    }

    PROCESSENTRY32W entry;
    entry.dwSize = sizeof(entry);
    DWORD parentId = 0;

    if (Process32FirstW(snapshot, &entry)) {
        do {
            if (entry.th32ProcessID == processId) {
                parentId = entry.th32ParentProcessID;
                break;
            }
        } while (Process32NextW(snapshot, &entry));
    }

    CloseHandle(snapshot);
    return parentId;
}

/*
 * Leaves this process attached to the terminal's console and returns the pid
 * that owns it, or 0 if no ancestor has one.
 *
 * GetConsoleWindow() is the discriminator: a console handed to a hook by
 * CREATE_NO_WINDOW reports 0, while the one the terminal hosts reports a real
 * handle. Counting attached processes does not work -- attaching is what makes
 * the count 2 on a private console.
 */
static DWORD attach_to_terminal_console(void) {
    DWORD candidateId = GetCurrentProcessId();

    for (int depth = 0; depth < MAX_ANCESTRY_DEPTH; depth++) {
        candidateId = parent_process_id(candidateId);
        if (candidateId == 0) {
            break;
        }

        FreeConsole();
        if (!AttachConsole(candidateId)) {
            continue;
        }
        if (GetConsoleWindow() != NULL) {
            return candidateId;
        }
        FreeConsole();
    }

    return 0;
}

/*
 * The spinner ticks in its own process because a hook is one-shot: it has to
 * return before the turn can proceed, so it cannot own a 100ms timer. The
 * worker is spawned DETACHED_PROCESS -- with no console of its own to discard
 * before it borrows the terminal's.
 */
static int spawn_spinner_worker(DWORD consoleProcessId, const wchar_t *title) {
    wchar_t executablePath[MAX_PATH];
    if (GetModuleFileNameW(NULL, executablePath, MAX_PATH) == 0) {
        return 0;
    }

    wchar_t commandLine[32768];
    _snwprintf_s(commandLine, 32768, _TRUNCATE, L"\"%ls\" --worker %lu \"%ls\"",
                 executablePath, consoleProcessId, title);

    STARTUPINFOW startupInfo;
    PROCESS_INFORMATION processInfo;
    ZeroMemory(&startupInfo, sizeof(startupInfo));
    startupInfo.cb = sizeof(startupInfo);
    ZeroMemory(&processInfo, sizeof(processInfo));

    if (!CreateProcessW(NULL, commandLine, NULL, NULL, FALSE,
                        DETACHED_PROCESS | CREATE_NEW_PROCESS_GROUP,
                        NULL, NULL, &startupInfo, &processInfo)) {
        return 0;
    }

    CloseHandle(processInfo.hThread);
    CloseHandle(processInfo.hProcess);
    return 1;
}

/*
 * Signals any running spinner and waits for it to actually be gone. The mutex
 * is the handshake: the worker holds it for its whole life, so acquiring it
 * means the last frame has been written and the caller's title is safe from
 * being overwritten a few milliseconds later.
 */
static HANDLE stop_spinner_and_take_lock(DWORD consoleProcessId) {
    wchar_t eventName[128];
    wchar_t mutexName[128];
    build_sync_name(eventName, 128, L"Spinner", consoleProcessId);
    build_sync_name(mutexName, 128, L"SpinnerLock", consoleProcessId);

    HANDLE stopEvent = CreateEventW(NULL, TRUE, FALSE, eventName);
    if (stopEvent != NULL) {
        SetEvent(stopEvent);
        CloseHandle(stopEvent);
    }

    HANDLE spinnerLock = CreateMutexW(NULL, FALSE, mutexName);
    if (spinnerLock != NULL) {
        /* WAIT_ABANDONED (a worker killed mid-frame) still hands over ownership. */
        WaitForSingleObject(spinnerLock, WORKER_HANDOFF_TIMEOUT_MS);
    }
    return spinnerLock;
}

static void release_spinner_lock(HANDLE spinnerLock) {
    if (spinnerLock != NULL) {
        ReleaseMutex(spinnerLock);
        CloseHandle(spinnerLock);
    }
}

static int run_spinner_worker(DWORD consoleProcessId, const wchar_t *title) {
    if (!AttachConsole(consoleProcessId)) {
        return 0;
    }

    wchar_t eventName[128];
    wchar_t mutexName[128];
    build_sync_name(eventName, 128, L"Spinner", consoleProcessId);
    build_sync_name(mutexName, 128, L"SpinnerLock", consoleProcessId);

    HANDLE spinnerLock = CreateMutexW(NULL, FALSE, mutexName);
    if (spinnerLock == NULL || WaitForSingleObject(spinnerLock, WORKER_HANDOFF_TIMEOUT_MS) == WAIT_TIMEOUT) {
        return 0;
    }

    HANDLE stopEvent = CreateEventW(NULL, TRUE, FALSE, eventName);
    if (stopEvent == NULL) {
        release_spinner_lock(spinnerLock);
        return 0;
    }
    ResetEvent(stopEvent);

    /* Waiting on the claude process too, so a crashed session leaves a still
     * tab rather than one spinning forever with nothing behind it. */
    HANDLE waitTargets[2];
    waitTargets[0] = stopEvent;
    waitTargets[1] = OpenProcess(SYNCHRONIZE, FALSE, consoleProcessId);
    DWORD waitCount = (waitTargets[1] != NULL) ? 2 : 1;

    wchar_t frameTitle[32768];
    for (int frame = 0;; frame++) {
        _snwprintf_s(frameTitle, 32768, _TRUNCATE, L"%ls %ls",
                     SPINNER_FRAMES[frame % SPINNER_FRAME_COUNT], title);
        SetConsoleTitleW(frameTitle);

        if (WaitForMultipleObjects(waitCount, waitTargets, FALSE, SPINNER_INTERVAL_MS) != WAIT_TIMEOUT) {
            break;
        }
    }

    if (waitTargets[1] != NULL) {
        CloseHandle(waitTargets[1]);
    }
    CloseHandle(stopEvent);
    release_spinner_lock(spinnerLock);
    return 0;
}

int wmain(int argc, wchar_t **argv) {
    /* Naming the tab is cosmetic: every failure below is silent and exits 0, so
     * a broken title can never colour the turn it was describing. */
    if (argc < 3) {
        return 0;
    }

    if (wcscmp(argv[1], L"--worker") == 0) {
        if (argc < 4) {
            return 0;
        }
        return run_spinner_worker((DWORD)_wtoi(argv[2]), argv[3]);
    }

    const wchar_t *title = argv[2];
    DWORD consoleProcessId = attach_to_terminal_console();
    if (consoleProcessId == 0) {
        return 0;
    }

    HANDLE spinnerLock = stop_spinner_and_take_lock(consoleProcessId);

    if (wcscmp(argv[1], L"busy") == 0) {
        /* Painted once here as well as by the worker: the worker takes a few
         * milliseconds to start, and the tab should never show the finished
         * state of the turn that just began. */
        SetConsoleTitleW(title);
        release_spinner_lock(spinnerLock);
        spawn_spinner_worker(consoleProcessId, title);
        return 0;
    }

    SetConsoleTitleW(title);
    release_spinner_lock(spinnerLock);
    return 0;
}
