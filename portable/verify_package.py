#!/usr/bin/env python3
"""Checks a staged portable package for things that break on Windows.

Nothing here needs Windows. It looks for the problems that make a package that
works on the build machine fail on a client's PC:

* paths longer than Windows' 260-character limit once extracted,
* file names Windows cannot create (CON, NUL, "a:b", trailing dot ...) and names
  that differ only by letter case (Windows would merge them),
* symlinks (zip files made on a Mac keep them; Windows cannot),
* launcher scripts that are not plain ASCII with Windows line endings,
* programs that need a DLL which is neither in the package nor a part of Windows
  itself (that is the "VCRUNTIME140.dll was not found" popup, and installing it
  needs administrator rights), and programs built for the wrong CPU.

    python verify_package.py portable/build/TaskAlign          (needs: pip install pefile)
"""
from __future__ import annotations

import re
import sys
from collections import defaultdict
from pathlib import Path

# A client may extract to a folder such as C:\Users\Some Long Name\Downloads\TaskAlign-Windows-1\.
# This is the longest base path we promise to support.
ASSUMED_BASE_PATH = "C:\\Users\\a-fairly-long-user-name\\Downloads\\TaskAlign-Windows-20260101-abcdef12\\"
WINDOWS_MAX_PATH = 260

RESERVED = {"CON", "PRN", "AUX", "NUL", *(f"COM{i}" for i in range(1, 10)), *(f"LPT{i}" for i in range(1, 10))}
ILLEGAL_CHARS = set('<>:"|?*')

# DLLs that are part of Windows 10/11 itself (so they are always present). Anything else a
# program imports must ship inside the package.
SYSTEM_DLLS = {
    "kernel32.dll", "kernelbase.dll", "ntdll.dll", "user32.dll", "gdi32.dll", "advapi32.dll",
    "shell32.dll", "ole32.dll", "oleaut32.dll", "ws2_32.dll", "wsock32.dll", "mswsock.dll",
    "iphlpapi.dll", "crypt32.dll", "bcrypt.dll", "ncrypt.dll", "secur32.dll", "userenv.dll",
    "version.dll", "winmm.dll", "shlwapi.dll", "comctl32.dll", "comdlg32.dll", "dbghelp.dll",
    "psapi.dll", "imm32.dll", "netapi32.dll", "wldap32.dll", "normaliz.dll", "rpcrt4.dll",
    "cfgmgr32.dll", "setupapi.dll", "powrprof.dll", "msvcrt.dll", "ucrtbase.dll", "dnsapi.dll",
    "winhttp.dll", "wintrust.dll", "dwmapi.dll", "uxtheme.dll", "shcore.dll", "rstrtmgr.dll",
    "avrt.dll", "pdh.dll", "mpr.dll", "sspicli.dll", "win32u.dll", "combase.dll", "sechost.dll",
    "ntmarta.dll", "cryptbase.dll", "bcryptprimitives.dll", "ncryptsslp.dll", "wevtapi.dll",
    "msi.dll", "cabinet.dll",  # Windows Installer; only used by Python's _msi module
}
SYSTEM_DLL_PREFIXES = ("api-ms-win-", "ext-ms-win-")


def check_names_and_paths(root: Path) -> list[str]:
    problems: list[str] = []
    by_lower: dict[str, list[str]] = defaultdict(list)
    longest = ("", 0)

    for path in sorted(root.rglob("*")):
        rel = path.relative_to(root).as_posix()
        by_lower[rel.lower()].append(rel)

        if path.is_symlink():
            problems.append(f"symlink (Windows cannot extract it): {rel}")

        for part in rel.split("/"):
            stem = part.split(".")[0].upper()
            if stem in RESERVED:
                problems.append(f"reserved Windows name '{part}': {rel}")
            if part.endswith((".", " ")):
                problems.append(f"name ends with a dot or space: {rel}")
            if ILLEGAL_CHARS & set(part):
                problems.append(f"illegal character in name: {rel}")
            if any(ord(c) > 127 for c in part):
                problems.append(f"non-ASCII name (can break on some PCs): {rel}")

        full = len(ASSUMED_BASE_PATH) + len(rel.replace("/", "\\"))
        if full > longest[1]:
            longest = (rel, full)
        if full >= WINDOWS_MAX_PATH:
            problems.append(f"path would be {full} characters long once extracted (limit {WINDOWS_MAX_PATH}): {rel}")

    for names in by_lower.values():
        if len(names) > 1:
            problems.append(f"names differ only by case (Windows would merge them): {names}")

    print(f"  longest path: {longest[1]} characters (with a long assumed base folder), limit {WINDOWS_MAX_PATH}")
    print(f"      {longest[0]}")
    return problems


def check_scripts(root: Path) -> list[str]:
    problems: list[str] = []
    for path in list(root.glob("*.bat")) + list(root.glob("*.txt")):
        raw = path.read_bytes()
        if any(b > 127 for b in raw):
            problems.append(f"{path.name}: contains non-ASCII characters")
        if re.search(rb"(?<!\r)\n", raw):
            problems.append(f"{path.name}: has Unix line endings (cmd.exe needs CRLF)")
    return problems


def check_binaries(root: Path) -> list[str]:
    try:
        import pefile
    except ImportError:
        return ["pefile is not installed, so the DLL check could not run (pip install pefile)"]

    present = {p.name.lower() for p in root.rglob("*") if p.is_file()}
    problems: list[str] = []
    checked = 0
    wrong_cpu: list[str] = []
    needs: dict[str, set[str]] = defaultdict(set)
    min_os: dict[str, tuple[int, int]] = {}

    for path in sorted(root.rglob("*")):
        if path.suffix.lower() not in {".exe", ".dll", ".pyd", ".node"} or not path.is_file():
            continue
        checked += 1
        pe = pefile.PE(str(path), fast_load=True)
        pe.parse_data_directories(directories=[
            pefile.DIRECTORY_ENTRY["IMAGE_DIRECTORY_ENTRY_IMPORT"],
            pefile.DIRECTORY_ENTRY["IMAGE_DIRECTORY_ENTRY_DELAY_IMPORT"],
        ])
        if pe.FILE_HEADER.Machine != 0x8664:
            wrong_cpu.append(f"{path.relative_to(root).as_posix()} is not 64-bit x86 (machine {pe.FILE_HEADER.Machine:#x})")
        if path.suffix.lower() == ".exe":
            min_os[path.name] = (pe.OPTIONAL_HEADER.MajorOperatingSystemVersion,
                                 pe.OPTIONAL_HEADER.MinorOperatingSystemVersion)

        entries = list(getattr(pe, "DIRECTORY_ENTRY_IMPORT", [])) + list(getattr(pe, "DIRECTORY_ENTRY_DELAY_IMPORT", []))
        for entry in entries:
            dll = entry.dll.decode("ascii", "replace").lower()
            if dll in SYSTEM_DLLS or dll.startswith(SYSTEM_DLL_PREFIXES) or dll in present:
                continue
            needs[dll].add(path.relative_to(root).as_posix())
        pe.close()

    problems += wrong_cpu
    for dll, users in sorted(needs.items()):
        problems.append(f"{dll} is needed by {sorted(users)[:3]} but is not in the package or part of Windows")

    print(f"  inspected {checked} Windows programs/libraries; every one is 64-bit x86: {not wrong_cpu}")
    for name, (major, minor) in sorted(min_os.items()):
        print(f"  {name:<12} header says Windows {major}.{minor}+ (not a reliable limit; see README: Windows 10 or 11)")
    return problems


def verify(root: Path) -> list[str]:
    print("Checking file names and paths ...")
    problems = check_names_and_paths(root)
    print("Checking launcher scripts ...")
    problems += check_scripts(root)
    print("Checking Windows programs and DLLs ...")
    problems += check_binaries(root)
    return problems


if __name__ == "__main__":
    target = Path(sys.argv[1]).resolve()
    issues = verify(target)
    if issues:
        print(f"\n{len(issues)} PROBLEM(S):")
        for issue in issues:
            print("  - " + issue)
        sys.exit(1)
    print("\nNo problems found.")
