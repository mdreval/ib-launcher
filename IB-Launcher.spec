# -*- mode: python ; coding: utf-8 -*-
import platform

block_cipher = None

a = Analysis(
    ['qt_version.py'],
    pathex=[],
    binaries=[],
    datas=[
        ('design.ui', '.'),
        ('assets/*', 'assets/'),
    ],
    hiddenimports=['psutil', 'win32gui', 'win32api', 'win32con'],
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[],
    win_no_prefer_redirects=False,
    win_private_assemblies=False,
    cipher=block_cipher,
    noarchive=False,
)

pyz = PYZ(a.pure, a.zipped_data, cipher=block_cipher)

if platform.system() == 'Windows':
    exe = EXE(
        pyz,
        a.scripts,
        a.binaries,
        a.zipfiles,
        a.datas,
        [],
        name='IB-Launcher',
        debug=False,
        bootloader_ignore_signals=False,
        strip=False,
        upx=True,
        upx_exclude=[],
        runtime_tmpdir=None,
        console=False,
        disable_windowed_traceback=False,
        argv_emulation=False,
        target_arch=None,
        codesign_identity=None,
        entitlements_file=None,
        icon='assets/icon.ico',
        version='version_info.txt'
    )
else:  # macOS
    exe = EXE(
        pyz,
        a.scripts,
        [],
        exclude_binaries=True,
        name='IB-Launcher',
        debug=False,
        bootloader_ignore_signals=False,
        strip=False,
        upx=True,
        console=False,
        disable_windowed_traceback=False,
        target_arch='universal2',
        codesign_identity=None,
        entitlements_file=None,
        icon='assets/icon.icns'
    )

    coll = COLLECT(
        exe,
        a.binaries,
        a.zipfiles,
        a.datas,
        strip=False,
        upx=True,
        upx_exclude=[],
        name='IB-Launcher'
    )

    app = BUNDLE(
        coll,
        name='IB-Launcher.app',
        icon='assets/icon.icns',
        bundle_identifier='com.igrobar.launcher',
        info_plist={
            'CFBundleShortVersionString': '1.0.6.2',
            'CFBundleVersion': '1.0.6.2',
            'NSHighResolutionCapable': True,
            'NSHumanReadableCopyright': 'Copyright (c) 2024 Igrobar'
        }
    )
