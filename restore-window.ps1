Add-Type @"
using System;
using System.Runtime.InteropServices;
public class W {
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr h, int n);
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);
}
"@
Get-Process xmd-editor -ErrorAction Stop | ForEach-Object {
  [W]::ShowWindow($_.MainWindowHandle, 9) | Out-Null
  [W]::SetForegroundWindow($_.MainWindowHandle) | Out-Null
  Write-Output ("handle=" + $_.MainWindowHandle)
}
