'use strict'

/**
 * WASAPI 环回采集器的 PowerShell 脚本（内嵌字符串）。
 *
 * 为什么必须自己写，而不能让 ffmpeg 直接抓：
 *   FFmpeg 官方构建里没有 WASAPI 环回输入设备（`-devices` 只有 dshow / openal /
 *   gdigrab / vfwcap / lavfi）。它的 `wasapi` 只是「往设备播放」的输出。
 *   而 dshow 只能枚举「音频采集端点」（麦克风、线路输入、立体声混音），
 *   拿不到「扬声器输出」——现代 USB 声卡/HDMI 音频基本都不提供立体声混音。
 *   所以想录「某个输出设备正在放什么」，只有 IAudioClient + LOOPBACK 一条路，
 *   这也是 OBS 的做法。
 *
 * 为什么用 PowerShell + Add-Type 而不是编译好的 exe：
 *   和 keySender.js 同一个理由 —— 项目里没有 C++ 构建链，
 *   引入原生模块要跟随 Electron 版本重编，风险高。
 *   PowerShell 是系统自带，Add-Type 现场编译一段 C#，零依赖。
 *   代价是首次启动约 1~1.5 秒（编译 + COM 初始化），之后进程常驻。
 */

// 脚本内容变更时递增，旧脚本会被覆盖重写
const SCRIPT_VERSION = 2

const WASAPI_SCRIPT = String.raw`param(
  [string]$Mode = 'list',
  [string]$DeviceId = '',
  [string]$Pipe = '',
  [int]$Seconds = 0
)
$ErrorActionPreference = 'Stop'

function Write-Utf8([string]$text) {
  $bytes = [System.Text.Encoding]::UTF8.GetBytes($text)
  $out = [Console]::OpenStandardOutput()
  $out.Write($bytes, 0, $bytes.Length)
  $out.Flush()
}

# 注意：下面 C# 段内不能出现非 ASCII 字符。
# Add-Type 会把源码写进临时 .cs 文件（ANSI），中文注释会被转码搞坏语法。
$cs = @'
using System;
using System.IO;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;

namespace GpWasapi
{
    internal enum EDataFlow { eRender = 0, eCapture = 1, eAll = 2 }
    internal enum ERole { eConsole = 0, eMultimedia = 1, eCommunications = 2 }

    [ComImport, Guid("BCDE0395-E52F-467C-8E3D-C4579291692E")]
    internal class MMDeviceEnumeratorComObject { }

    [ComImport, Guid("A95664D2-9614-4F35-A746-DE8DB63617E6"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    internal interface IMMDeviceEnumerator
    {
        [PreserveSig] int EnumAudioEndpoints(EDataFlow dataFlow, int stateMask, out IMMDeviceCollection devices);
        [PreserveSig] int GetDefaultAudioEndpoint(EDataFlow dataFlow, ERole role, out IMMDevice device);
        [PreserveSig] int GetDevice([MarshalAs(UnmanagedType.LPWStr)] string id, out IMMDevice device);
        [PreserveSig] int RegisterEndpointNotificationCallback(IntPtr client);
        [PreserveSig] int UnregisterEndpointNotificationCallback(IntPtr client);
    }

    [ComImport, Guid("0BD7A1BE-7A1A-44DB-8397-CC5392387B5E"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    internal interface IMMDeviceCollection
    {
        [PreserveSig] int GetCount(out int count);
        [PreserveSig] int Item(int index, out IMMDevice device);
    }

    [ComImport, Guid("D666063F-1587-4E43-81F1-B948E807363F"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    internal interface IMMDevice
    {
        [PreserveSig] int Activate(ref Guid iid, int clsCtx, IntPtr activationParams, [MarshalAs(UnmanagedType.IUnknown)] out object iface);
        [PreserveSig] int OpenPropertyStore(int access, out IPropertyStore properties);
        [PreserveSig] int GetId([MarshalAs(UnmanagedType.LPWStr)] out string id);
        [PreserveSig] int GetState(out int state);
    }

    [ComImport, Guid("886D8EEB-8CF2-4446-8D02-CDBA1DBDCF99"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    internal interface IPropertyStore
    {
        [PreserveSig] int GetCount(out int count);
        [PreserveSig] int GetAt(int index, out PROPERTYKEY key);
        [PreserveSig] int GetValue(ref PROPERTYKEY key, out PROPVARIANT value);
        [PreserveSig] int SetValue(ref PROPERTYKEY key, ref PROPVARIANT value);
        [PreserveSig] int Commit();
    }

    [StructLayout(LayoutKind.Sequential)]
    internal struct PROPERTYKEY { public Guid fmtid; public int pid; }

    [StructLayout(LayoutKind.Sequential)]
    internal struct PROPVARIANT
    {
        public ushort vt; public ushort r1; public ushort r2; public ushort r3;
        public IntPtr p; public IntPtr p2;
    }

    [ComImport, Guid("1CB9AD4C-DBFA-4c32-B178-C2F568A703B2"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    internal interface IAudioClient
    {
        [PreserveSig] int Initialize(int shareMode, int streamFlags, long bufferDuration, long periodicity, IntPtr format, IntPtr sessionGuid);
        [PreserveSig] int GetBufferSize(out int frames);
        [PreserveSig] int GetStreamLatency(out long latency);
        [PreserveSig] int GetCurrentPadding(out int frames);
        [PreserveSig] int IsFormatSupported(int shareMode, IntPtr format, out IntPtr closest);
        [PreserveSig] int GetMixFormat(out IntPtr format);
        [PreserveSig] int GetDevicePeriod(out long defPeriod, out long minPeriod);
        [PreserveSig] int Start();
        [PreserveSig] int Stop();
        [PreserveSig] int Reset();
        [PreserveSig] int SetEventHandle(IntPtr handle);
        [PreserveSig] int GetService(ref Guid iid, [MarshalAs(UnmanagedType.IUnknown)] out object service);
    }

    [ComImport, Guid("C8ADBD64-E71E-48a0-A4DE-185C395CD317"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    internal interface IAudioCaptureClient
    {
        [PreserveSig] int GetBuffer(out IntPtr data, out int frames, out int flags, out long devicePos, out long qpcPos);
        [PreserveSig] int ReleaseBuffer(int frames);
        [PreserveSig] int GetNextPacketSize(out int frames);
    }

    [StructLayout(LayoutKind.Sequential, Pack = 1)]
    internal struct WAVEFORMATEX
    {
        public ushort wFormatTag; public ushort nChannels; public uint nSamplesPerSec;
        public uint nAvgBytesPerSec; public ushort nBlockAlign; public ushort wBitsPerSample; public ushort cbSize;
    }

    public static class Api
    {
        const int CLSCTX_ALL = 23;
        const int STREAMFLAGS_LOOPBACK = 0x00020000;
        const int STREAMFLAGS_AUTOCONVERTPCM = unchecked((int)0x80000000);
        const int STREAMFLAGS_SRC_DEFAULT_QUALITY = 0x08000000;
        const int DEVICE_STATE_ACTIVE = 0x1;
        const int STGM_READ = 0;
        const int BUFFER_FLAG_SILENT = 0x2;

        [DllImport("ole32.dll")]
        static extern int PropVariantClear(ref PROPVARIANT pv);

        static PROPERTYKEY PkeyName = MakePkey("a45c254e-df1c-4efd-8020-67d146a850e0", 14);

        static PROPERTYKEY MakePkey(string guid, int pid)
        {
            PROPERTYKEY k = new PROPERTYKEY();
            k.fmtid = new Guid(guid);
            k.pid = pid;
            return k;
        }

        static string Esc(string s)
        {
            if (s == null) return "";
            StringBuilder b = new StringBuilder();
            for (int i = 0; i < s.Length; i++)
            {
                char c = s[i];
                if (c == '"' || c == '\\') b.Append('\\').Append(c);
                else if (c < ' ') b.Append(' ');
                else b.Append(c);
            }
            return b.ToString();
        }

        static IMMDeviceEnumerator Enumerator()
        {
            return (IMMDeviceEnumerator)(new MMDeviceEnumeratorComObject());
        }

        static string FriendlyName(IMMDevice d)
        {
            IPropertyStore ps;
            if (d.OpenPropertyStore(STGM_READ, out ps) != 0 || ps == null) return "";
            try
            {
                PROPVARIANT pv;
                PROPERTYKEY key = PkeyName;
                if (ps.GetValue(ref key, out pv) != 0) return "";
                try
                {
                    // VT_LPWSTR
                    if (pv.vt == 31 && pv.p != IntPtr.Zero) return Marshal.PtrToStringUni(pv.p);
                    return "";
                }
                finally { PropVariantClear(ref pv); }
            }
            finally { Marshal.ReleaseComObject(ps); }
        }

        static IMMDevice Resolve(IMMDeviceEnumerator en, string deviceId)
        {
            IMMDevice d = null;
            if (deviceId != null && deviceId.Length > 0)
            {
                if (en.GetDevice(deviceId, out d) == 0 && d != null) return d;
            }
            if (en.GetDefaultAudioEndpoint(EDataFlow.eRender, ERole.eConsole, out d) != 0 || d == null)
                throw new Exception("no render endpoint");
            return d;
        }

        // eRender only: these are OUTPUT devices (speakers, HDMI, virtual).
        // Capture endpoints (microphones) live in eCapture and are never loopback-able.
        public static string ListDevices()
        {
            IMMDeviceEnumerator en = Enumerator();
            string defId = "";
            try
            {
                IMMDevice def = null;
                if (en.GetDefaultAudioEndpoint(EDataFlow.eRender, ERole.eConsole, out def) == 0 && def != null)
                {
                    def.GetId(out defId);
                    Marshal.ReleaseComObject(def);
                }
            }
            catch (Exception) { }

            IMMDeviceCollection col;
            int hr = en.EnumAudioEndpoints(EDataFlow.eRender, DEVICE_STATE_ACTIVE, out col);
            if (hr != 0) throw new COMException("EnumAudioEndpoints 0x" + hr.ToString("X8"), hr);

            int count = 0;
            col.GetCount(out count);
            StringBuilder sb = new StringBuilder();
            sb.Append("[");
            for (int i = 0; i < count; i++)
            {
                IMMDevice d;
                if (col.Item(i, out d) != 0 || d == null) continue;
                string id = ""; string name = "";
                try { d.GetId(out id); } catch (Exception) { }
                try { name = FriendlyName(d); } catch (Exception) { }
                if (sb.Length > 1) sb.Append(",");
                sb.Append("{\"id\":\"").Append(Esc(id)).Append("\",\"name\":\"").Append(Esc(name)).Append("\",\"default\":").Append(id == defId ? "true" : "false").Append("}");
                Marshal.ReleaseComObject(d);
            }
            sb.Append("]");
            Marshal.ReleaseComObject(col);
            return sb.ToString();
        }

        static string FormatName(IntPtr pFormat, WAVEFORMATEX wf)
        {
            int tag = wf.wFormatTag;
            int bits = wf.wBitsPerSample;
            if (tag == 0xFFFE && wf.cbSize >= 22)
            {
                // WAVEFORMATEXTENSIBLE: SubFormat GUID starts at +24, first 4 bytes hold the real tag
                tag = Marshal.ReadInt32(pFormat, 18 + 2 + 4);
            }
            if (tag == 3) return bits == 64 ? "f64le" : "f32le";
            if (bits == 8) return "u8";
            if (bits == 24) return "s24le";
            if (bits == 32) return "s32le";
            return "s16le";
        }

        static IAudioClient InitClient(IMMDevice dev, out WAVEFORMATEX used, out bool autoconvert, out string fmt)
        {
            object raw;
            Guid iid = typeof(IAudioClient).GUID;
            int hr = dev.Activate(ref iid, CLSCTX_ALL, IntPtr.Zero, out raw);
            if (hr != 0) throw new COMException("Activate 0x" + hr.ToString("X8"), hr);
            IAudioClient client = (IAudioClient)raw;

            // Preferred path: ask the audio engine to convert its own mix format
            // into plain s16 / 48k / stereo. AUTOCONVERTPCM makes this legal in
            // shared mode, so ffmpeg always gets one predictable format.
            WAVEFORMATEX wf = new WAVEFORMATEX();
            wf.wFormatTag = 1; wf.nChannels = 2; wf.nSamplesPerSec = 48000;
            wf.wBitsPerSample = 16; wf.nBlockAlign = 4; wf.nAvgBytesPerSec = 192000; wf.cbSize = 0;

            IntPtr p = Marshal.AllocCoTaskMem(Marshal.SizeOf(typeof(WAVEFORMATEX)));
            Marshal.StructureToPtr(wf, p, false);
            int flags = STREAMFLAGS_LOOPBACK | STREAMFLAGS_AUTOCONVERTPCM | STREAMFLAGS_SRC_DEFAULT_QUALITY;
            hr = client.Initialize(0, flags, 2000000, 0, p, IntPtr.Zero);
            Marshal.FreeCoTaskMem(p);
            if (hr == 0) { used = wf; autoconvert = true; fmt = "s16le"; return client; }

            // Fallback: take the device mix format as-is and let ffmpeg resample.
            IntPtr pmix;
            hr = client.GetMixFormat(out pmix);
            if (hr != 0) throw new COMException("GetMixFormat 0x" + hr.ToString("X8"), hr);
            WAVEFORMATEX mix = (WAVEFORMATEX)Marshal.PtrToStructure(pmix, typeof(WAVEFORMATEX));
            string mixFmt = FormatName(pmix, mix);
            int hr2 = client.Initialize(0, STREAMFLAGS_LOOPBACK, 2000000, 0, pmix, IntPtr.Zero);
            Marshal.FreeCoTaskMem(pmix);
            if (hr2 != 0) throw new COMException("Initialize 0x" + hr2.ToString("X8"), hr2);
            used = mix; autoconvert = false; fmt = mixFmt;
            return client;
        }

        public static string Probe(string deviceId)
        {
            try
            {
                IMMDeviceEnumerator en = Enumerator();
                IMMDevice dev = Resolve(en, deviceId);
                WAVEFORMATEX wf; bool ac; string fmt;
                IAudioClient client = InitClient(dev, out wf, out ac, out fmt);
                string r = "ok|" + wf.nSamplesPerSec + "|" + wf.nChannels + "|" + fmt + "|" + (ac ? "1" : "0");
                try { client.Stop(); } catch (Exception) { }
                Marshal.ReleaseComObject(client);
                return r;
            }
            catch (Exception ex) { return "err|" + ex.Message; }
        }

        static void WriteSilence(Stream output, long bytes, ref byte[] buffer)
        {
            if (bytes <= 0) return;
            while (bytes > 0)
            {
                int n = (int)Math.Min(bytes, (long)buffer.Length);
                Array.Clear(buffer, 0, n);
                output.Write(buffer, 0, n);
                bytes -= n;
            }
        }

        public static void Run(string deviceId, Stream output, int maxSeconds)
        {
            IMMDeviceEnumerator en = Enumerator();
            IMMDevice dev = Resolve(en, deviceId);
            WAVEFORMATEX wf; bool ac; string fmt;
            IAudioClient client = InitClient(dev, out wf, out ac, out fmt);

            Guid capIid = typeof(IAudioCaptureClient).GUID;
            object capRaw;
            int hr = client.GetService(ref capIid, out capRaw);
            if (hr != 0) throw new COMException("GetService 0x" + hr.ToString("X8"), hr);
            IAudioCaptureClient cap = (IAudioCaptureClient)capRaw;

            int blockAlign = wf.nBlockAlign > 0 ? wf.nBlockAlign : 4;
            hr = client.Start();
            if (hr != 0) throw new COMException("Start 0x" + hr.ToString("X8"), hr);

            byte[] buffer = new byte[256 * 1024];
            long bytesPerSecond = (long)wf.nSamplesPerSec * blockAlign;
            System.Diagnostics.Stopwatch sw = System.Diagnostics.Stopwatch.StartNew();
            long written = 0;
            long limitTicks = maxSeconds > 0 ? (long)(maxSeconds * 1000.0 * 10000.0) : -1;

            while (true)
            {
                if (limitTicks > 0 && sw.Elapsed.Ticks > limitTicks) break;

                int packet;
                cap.GetNextPacketSize(out packet);
                while (packet > 0)
                {
                    IntPtr data; int frames; int flags; long devPos; long qpc;
                    hr = cap.GetBuffer(out data, out frames, out flags, out devPos, out qpc);
                    if (hr != 0) break;
                    int bytes = frames * blockAlign;
                    if (bytes > 0)
                    {
                        if ((flags & BUFFER_FLAG_SILENT) != 0 || data == IntPtr.Zero)
                        {
                            WriteSilence(output, bytes, ref buffer);
                        }
                        else
                        {
                            if (bytes > buffer.Length) buffer = new byte[bytes];
                            Marshal.Copy(data, buffer, 0, bytes);
                            output.Write(buffer, 0, bytes);
                        }
                        written += bytes;
                    }
                    cap.ReleaseBuffer(frames);
                    cap.GetNextPacketSize(out packet);
                }

                // When the endpoint is idle WASAPI delivers no packets at all.
                // Raw PCM has no timestamps, so we must pad with silence against
                // the wall clock, otherwise the audio track ends up shorter than
                // the video track and drifts out of sync over time.
                long expected = (long)(sw.Elapsed.TotalSeconds * bytesPerSecond);
                long gap = expected - written;
                if (gap > blockAlign * 240)
                {
                    gap -= gap % blockAlign;
                    WriteSilence(output, gap, ref buffer);
                    written += gap;
                }
                output.Flush();
                Thread.Sleep(6);
            }

            try { client.Stop(); } catch (Exception) { }
        }
    }
}
'@

try {
  if (-not ('GpWasapi.Api' -as [type])) {
    Add-Type -TypeDefinition $cs -Language CSharp -ErrorAction Stop
  }

  if ($Mode -eq 'list') {
    Write-Utf8 ([GpWasapi.Api]::ListDevices())
    exit 0
  }

  if ($Mode -eq 'probe') {
    Write-Utf8 ([GpWasapi.Api]::Probe($DeviceId))
    exit 0
  }

  if ($Mode -eq 'capture') {
    # 先探测格式：失败要立刻回报，别让上层苦等管道
    $probe = [GpWasapi.Api]::Probe($DeviceId)
    if ($probe.StartsWith('err|')) { Write-Utf8 ('ERR|' + $probe); exit 1 }
    $seg = $probe.Split('|')

    # 命名管道而不是 stdout：ffmpeg 的 stdin 要留给 'q'（优雅收尾）
    $server = New-Object System.IO.Pipes.NamedPipeServerStream($Pipe, [System.IO.Pipes.PipeDirection]::Out, 1, [System.IO.Pipes.PipeTransmissionMode]::Byte, [System.IO.Pipes.PipeOptions]::None)
    Write-Utf8 ('READY|' + $seg[1] + '|' + $seg[2] + '|' + $seg[3])
    $task = $server.WaitForConnectionAsync()
    if (-not $task.Wait(20000)) { Write-Utf8 'ERR|pipe connect timeout'; exit 2 }

    [GpWasapi.Api]::Run($DeviceId, $server, $Seconds)
    $server.Dispose()
    exit 0
  }

  Write-Utf8 'ERR|unknown mode'
  exit 3
}
catch {
  Write-Utf8 ('ERR|' + $_.Exception.Message)
  exit 9
}
`

module.exports = { WASAPI_SCRIPT, SCRIPT_VERSION }
