# -*- mode: python ; coding: utf-8 -*-

block_cipher = None

a = Analysis(
    ['qt_version.py'],
    pathex=[],
    binaries=[],
    datas=[
        ('design.ui', '.'),
        ('assets/*', 'assets/'),
    ],
    hiddenimports=['psutil'],
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=['_multiarray_tests'],
    win_no_prefer_redirects=False,
    win_private_assemblies=False,
    cipher=block_cipher,
    noarchive=False,
)

pyz = PYZ(a.pure, a.zipped_data, cipher=block_cipher)

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
    target_arch=None,
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
        'CFBundleShortVersionString': '1.0.6.4',
        'CFBundleVersion': '1.0.6.4',
        'NSHighResolutionCapable': True,
        'NSHumanReadableCopyright': 'Copyright (c) 2024 Igrobar',
        'LSMinimumSystemVersion': '10.13.0',
        'NSAppleEventsUsageDescription': 'IB Launcher needs to control Minecraft for launching.',
        'NSAppleMusicUsageDescription': 'IB Launcher needs access to media for game sounds.',
        'NSMicrophoneUsageDescription': 'IB Launcher needs microphone access for in-game voice chat.',
        'NSDocumentsFolderUsageDescription': 'IB Launcher needs access to Documents for saving game files.',
        'NSDownloadsFolderUsageDescription': 'IB Launcher needs access to Downloads for modpack updates.',
        'LSApplicationCategoryType': 'public.app-category.games',
        'LSRequiresNativeExecution': True
    }
) 