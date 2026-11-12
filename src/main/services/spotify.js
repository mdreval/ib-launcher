/**
 * Spotify на вкладке «Музыка»: что играет в приложении Spotify на этом
 * компьютере и управление им (пауза, следующий/предыдущий, перемотка).
 *
 * Играет сам Spotify (с вашим аккаунтом, бесплатным или Premium) — лаунчер
 * только показывает трек и нажимает кнопки, как медиаклавиши клавиатуры.
 * Ключи разработчика и вход не нужны.
 *
 *  - Windows: системные медиаконтролы Windows (SMTC) через фоновый
 *    PowerShell-помощник — он запускается, только пока открыта вкладка
 *    «Музыка», и сам закрывается через минуту без запросов.
 *  - macOS: AppleScript (osascript).
 */

const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawn, execFile } = require("child_process");
const { shell } = require("electron");

const paths = require("../paths");

// ---------------------------------------------------------------- Windows

const PS_SCRIPT = String.raw`
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding $false
Add-Type -AssemblyName System.Runtime.WindowsRuntime
$asTaskGeneric = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object { $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation` + "`" + String.raw`1' })[0]
function Await($op, [Type]$type) {
  $t = $asTaskGeneric.MakeGenericMethod($type).Invoke($null, @($op))
  $null = $t.Wait(5000)
  if ($t.IsCompleted) { return $t.Result }
  return $null
}
$null = [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager, Windows.Media.Control, ContentType = WindowsRuntime]
$null = [Windows.Storage.Streams.DataReader, Windows.Storage.Streams, ContentType = WindowsRuntime]
$mgr = Await ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager]::RequestAsync()) ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager])
$script:lastKey = ''

$script:volOk = $false
try {
Add-Type -Language CSharp -TypeDefinition @"
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Runtime.InteropServices;
namespace IgrobarAudio {
  [ComImport, Guid("BCDE0395-E52F-467C-8E3D-C4579291692E")] class MMDeviceEnumeratorCom {}
  [ComImport, Guid("A95664D2-9614-4F35-A746-DE8DB63617E6"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  interface IMMDeviceEnumerator { [PreserveSig] int EnumAudioEndpoints(int a, int b, out IntPtr c); [PreserveSig] int GetDefaultAudioEndpoint(int dataFlow, int role, out IMMDevice device); }
  [ComImport, Guid("D666063F-1587-4E43-81F1-B948E807363F"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  interface IMMDevice { [PreserveSig] int Activate(ref Guid iid, int ctx, IntPtr p, [MarshalAs(UnmanagedType.IUnknown)] out object o); }
  [ComImport, Guid("77AA99A0-1BD6-484F-8BC7-2C654C9A9B6F"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  interface IAudioSessionManager2 { [PreserveSig] int N1(); [PreserveSig] int N2(); [PreserveSig] int GetSessionEnumerator(out IAudioSessionEnumerator e); }
  [ComImport, Guid("E2F5BB11-0570-40CA-ACDD-3AA01277DEE8"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  interface IAudioSessionEnumerator { [PreserveSig] int GetCount(out int n); [PreserveSig] int GetSession(int i, out IAudioSessionControl2 s); }
  [ComImport, Guid("bfb7ff88-7239-4fc9-8fa2-07c950be9c6d"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  interface IAudioSessionControl2 {
    [PreserveSig] int N1(); [PreserveSig] int N2(); [PreserveSig] int N3(); [PreserveSig] int N4(); [PreserveSig] int N5();
    [PreserveSig] int N6(); [PreserveSig] int N7(); [PreserveSig] int N8(); [PreserveSig] int N9();
    [PreserveSig] int GetSessionIdentifier([MarshalAs(UnmanagedType.LPWStr)] out string s);
    [PreserveSig] int GetSessionInstanceIdentifier([MarshalAs(UnmanagedType.LPWStr)] out string s);
    [PreserveSig] int GetProcessId(out int pid);
  }
  [ComImport, Guid("87CE5498-68D6-44E5-9215-6DA47EF883D8"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  interface ISimpleAudioVolume { [PreserveSig] int SetMasterVolume(float level, ref Guid ctx); [PreserveSig] int GetMasterVolume(out float level); }
  public static class SpotifyVolume {
    static List<ISimpleAudioVolume> Sessions() {
      var list = new List<ISimpleAudioVolume>();
      var en = (IMMDeviceEnumerator)(new MMDeviceEnumeratorCom());
      IMMDevice dev;
      if (en.GetDefaultAudioEndpoint(0, 1, out dev) != 0 || dev == null) return list;
      Guid iid = typeof(IAudioSessionManager2).GUID;
      object o;
      if (dev.Activate(ref iid, 23, IntPtr.Zero, out o) != 0) return list;
      IAudioSessionEnumerator se;
      if (((IAudioSessionManager2)o).GetSessionEnumerator(out se) != 0) return list;
      int n; se.GetCount(out n);
      for (int i = 0; i < n; i++) {
        IAudioSessionControl2 c; se.GetSession(i, out c);
        if (c == null) continue;
        int pid; c.GetProcessId(out pid);
        try {
          if (pid > 0 && Process.GetProcessById(pid).ProcessName.ToLower().Contains("spotify")) list.Add((ISimpleAudioVolume)c);
        } catch {}
      }
      return list;
    }
    public static float Get() {
      foreach (var v in Sessions()) { float f; v.GetMasterVolume(out f); return f; }
      return -1;
    }
    public static bool Set(float level) {
      bool ok = false; Guid g = Guid.Empty;
      foreach (var v in Sessions()) { v.SetMasterVolume(level, ref g); ok = true; }
      return ok;
    }
  }
}
"@
$script:volOk = $true
} catch { $script:volOk = $false }

function Get-Session {
  if (-not $mgr) { return $null }
  return $mgr.GetSessions() | Where-Object { $_.SourceAppUserModelId -match 'spotify' } | Select-Object -First 1
}

function Get-Cover($props) {
  if (-not $props.Thumbnail) { return '' }
  $stream = Await ($props.Thumbnail.OpenReadAsync()) ([Windows.Storage.Streams.IRandomAccessStreamWithContentType])
  if (-not $stream) { return '' }
  $size = [uint32]$stream.Size
  if ($size -eq 0 -or $size -gt 4000000) { $stream.Dispose(); return '' }
  $reader = New-Object Windows.Storage.Streams.DataReader($stream.GetInputStreamAt(0))
  $null = Await ($reader.LoadAsync($size)) ([uint32])
  $bytes = New-Object byte[] $size
  $reader.ReadBytes($bytes)
  $reader.Dispose()
  $stream.Dispose()
  $mime = 'image/png'
  if ($bytes[0] -eq 0xFF) { $mime = 'image/jpeg' }
  return 'data:' + $mime + ';base64,' + [Convert]::ToBase64String($bytes)
}

function Get-State {
  $s = Get-Session
  if (-not $s) { $script:lastKey = ''; return @{ running = $false } }
  $p = Await ($s.TryGetMediaPropertiesAsync()) ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionMediaProperties])
  $tl = $s.GetTimelineProperties()
  $info = $s.GetPlaybackInfo()
  $playing = $info.PlaybackStatus.ToString() -eq 'Playing'
  $dur = $tl.EndTime.TotalSeconds
  $pos = $tl.Position.TotalSeconds
  if ($playing -and $tl.LastUpdatedTime.Year -gt 2000) { $pos += ([DateTimeOffset]::Now - $tl.LastUpdatedTime).TotalSeconds }
  if ($dur -gt 0 -and $pos -gt $dur) { $pos = $dur }
  if ($pos -lt 0) { $pos = 0 }
  $out = @{
    running = $true; playing = $playing
    title = [string]$p.Title; artist = [string]$p.Artist; album = [string]$p.AlbumTitle
    position = [math]::Round($pos, 1); duration = [math]::Round($dur, 1)
    canSeek = [bool]$info.Controls.IsPlaybackPositionEnabled
    volume = -1
  }
  if ($script:volOk) { try { $out.volume = [math]::Round([IgrobarAudio.SpotifyVolume]::Get(), 2) } catch { } }
  $key = [string]$p.Title + '|' + [string]$p.Artist
  if ($key -ne $script:lastKey) {
    $script:lastKey = $key
    try { $out.cover = Get-Cover $p } catch { $out.cover = '' }
  }
  return $out
}

while ($true) {
  $line = [Console]::In.ReadLine()
  if ($line -eq $null) { break }
  $parts = $line.Trim().Split(' ', 2)
  $cmd = $parts[0]
  try {
    $s = Get-Session
    if ($s) {
      switch ($cmd) {
        'toggle' { $null = Await ($s.TryTogglePlayPauseAsync()) ([bool]) }
        'next' { $null = Await ($s.TrySkipNextAsync()) ([bool]) }
        'prev' { $null = Await ($s.TrySkipPreviousAsync()) ([bool]) }
        'volume' {
          if ($script:volOk) { $null = [IgrobarAudio.SpotifyVolume]::Set([float][double]::Parse($parts[1], [Globalization.CultureInfo]::InvariantCulture)) }
        }
        'seek' {
          $ticks = [int64]([double]::Parse($parts[1], [Globalization.CultureInfo]::InvariantCulture) * 10000000)
          $null = Await ($s.TryChangePlaybackPositionAsync($ticks)) ([bool])
        }
      }
      if ($cmd -ne 'state' -and $cmd -ne 'volume') { Start-Sleep -Milliseconds 300 }
    }
    $state = Get-State
    [Console]::Out.WriteLine(($state | ConvertTo-Json -Compress))
  } catch {
    [Console]::Out.WriteLine((@{ error = $_.Exception.Message } | ConvertTo-Json -Compress))
  }
}
`;

let proc = null;
let buffer = "";
let waiting = []; // очередь ожидающих ответа
let idleTimer = null;
let cover = "";
let lastKey = "";

function scriptPath() {
  const file = path.join(paths.LAUNCHER_DIR, "spotify-helper.ps1");
  try {
    if (!fs.existsSync(file) || fs.readFileSync(file, "utf8") !== PS_SCRIPT) {
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, PS_SCRIPT, "utf8");
    }
  } catch (err) {
    const tmp = path.join(os.tmpdir(), "igrobar-spotify-helper.ps1");
    fs.writeFileSync(tmp, PS_SCRIPT, "utf8");
    return tmp;
  }
  return file;
}

function stopHelper() {
  clearTimeout(idleTimer);
  if (proc) {
    try {
      proc.stdin.end();
      proc.kill();
    } catch (err) {
      /* уже закрыт */
    }
  }
  proc = null;
  buffer = "";
  for (const w of waiting) w.resolve({ running: false, error: "helper stopped" });
  waiting = [];
}

function startHelper() {
  if (proc) return proc;
  const ps = path.join(process.env.SystemRoot || "C:\\Windows", "System32", "WindowsPowerShell", "v1.0", "powershell.exe");
  proc = spawn(fs.existsSync(ps) ? ps : "powershell.exe", ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", scriptPath()], { windowsHide: true });
  proc.stdout.setEncoding("utf8");
  proc.stdout.on("data", (chunk) => {
    buffer += chunk;
    let i;
    while ((i = buffer.indexOf("\n")) >= 0) {
      const line = buffer.slice(0, i).replace(/^\uFEFF/, "").trim();
      buffer = buffer.slice(i + 1);
      if (!line.startsWith("{")) continue;
      const w = waiting.shift();
      if (!w) continue;
      clearTimeout(w.timer);
      try {
        w.resolve(JSON.parse(line));
      } catch (err) {
        w.resolve({ error: "bad answer" });
      }
    }
  });
  proc.stderr.on("data", () => {});
  proc.on("exit", () => {
    proc = null;
    for (const w of waiting) w.resolve({ running: false, error: "helper exited" });
    waiting = [];
  });
  proc.on("error", () => stopHelper());
  return proc;
}

function askWindows(command) {
  clearTimeout(idleTimer);
  idleTimer = setTimeout(stopHelper, 60000); // нет запросов минуту — помощник закрывается
  const p = startHelper();
  return new Promise((resolve) => {
    // первый запуск PowerShell бывает долгим — ждём до 15 секунд
    const w = { resolve, timer: setTimeout(() => {
      const idx = waiting.indexOf(w);
      if (idx >= 0) waiting.splice(idx, 1);
      resolve({ error: "timeout" });
    }, 15000) };
    waiting.push(w);
    try {
      p.stdin.write(`${command}\n`);
    } catch (err) {
      resolve({ error: err.message });
    }
  });
}

// ---------------------------------------------------------------- macOS

function osa(script) {
  return new Promise((resolve) => {
    execFile("osascript", ["-e", script], { timeout: 5000 }, (err, stdout) => resolve(err ? null : String(stdout).trim()));
  });
}

async function askMac(command, arg) {
  const tell = (body) => `if application "Spotify" is running then
tell application "Spotify" to ${body}
end if`;
  if (command === "toggle") await osa(tell("playpause"));
  if (command === "next") await osa(tell("next track"));
  if (command === "prev") await osa(tell("previous track"));
  if (command === "seek") await osa(tell(`set player position to ${Number(arg) || 0}`));
  if (command === "volume") await osa(tell(`set sound volume to ${Math.round(Math.max(0, Math.min(1, Number(arg) || 0)) * 100)}`));
  const out = await osa(`if application "Spotify" is running then
tell application "Spotify"
set t to current track
return (player state as string) & linefeed & (name of t) & linefeed & (artist of t) & linefeed & (album of t) & linefeed & (player position as string) & linefeed & ((duration of t) as string) & linefeed & (artwork url of t) & linefeed & ((sound volume) as string)
end tell
else
return "notrunning"
end if`);
  if (!out || out === "notrunning") return { running: false };
  const [state, title, artist, album, pos, dur, art, vol] = out.split("\n");
  const num = (v) => Number(String(v || "0").replace(",", ".")) || 0;
  const res = {
    running: true,
    playing: state === "playing",
    title,
    artist,
    album,
    position: num(pos),
    duration: num(dur) / 1000,
    canSeek: true,
    volume: vol === undefined ? -1 : num(vol) / 100,
  };
  const key = `${title}|${artist}`;
  if (key !== lastKey) res.cover = art || "";
  return res;
}

// ---------------------------------------------------------------- общее

function supported() {
  return process.platform === "win32" || process.platform === "darwin";
}

async function command(cmd = "state", arg) {
  if (!["state", "toggle", "next", "prev", "seek", "volume"].includes(cmd)) throw new Error("Неизвестная команда");
  if (!supported()) return { supported: false, running: false };
  const raw = process.platform === "win32" ? await askWindows(cmd === "seek" || cmd === "volume" ? `${cmd} ${Math.max(0, Number(arg) || 0)}` : cmd) : await askMac(cmd, arg);
  const key = `${raw.title || ""}|${raw.artist || ""}`;
  if (raw.cover !== undefined) {
    cover = raw.cover || "";
    lastKey = key;
  } else if (key !== lastKey && process.platform === "darwin") {
    lastKey = key;
  }
  if (!raw.running) {
    cover = "";
    lastKey = "";
  }
  return { supported: true, ...raw, cover: raw.running ? cover : "" };
}

/** Открыть Spotify или ссылку на плейлист/альбом/трек в приложении Spotify. */
async function open(link) {
  const url = String(link || "").trim();
  if (!url) return shell.openExternal("spotify:");
  const m = url.match(/open\.spotify\.com\/(?:intl-[a-z-]+\/)?(playlist|album|track|artist|show|episode)\/([A-Za-z0-9]+)/i);
  if (m) return shell.openExternal(`spotify:${m[1].toLowerCase()}:${m[2]}`);
  if (/^spotify:[a-z]+:[A-Za-z0-9]+$/i.test(url)) return shell.openExternal(url);
  throw new Error("Вставьте ссылку Spotify (open.spotify.com/…)");
}

module.exports = { command, open, stop: stopHelper, supported };
