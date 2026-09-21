#[cfg(target_os = "windows")]
use windows::Win32::Foundation::HWND;
#[cfg(target_os = "windows")]
use windows::Win32::UI::WindowsAndMessaging::{SetWindowDisplayAffinity, WDA_EXCLUDEFROMCAPTURE, WDA_NONE};


#[tauri::command]
fn enable_capture_protection(window: tauri::Window) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        if let Ok(hwnd) = window.hwnd() {
            let hwnd = HWND(hwnd.0 as _);
            unsafe {
                let _ = SetWindowDisplayAffinity(hwnd, WDA_EXCLUDEFROMCAPTURE);
            }
        }
    }
    Ok(())
}

#[tauri::command]
fn disable_capture_protection(window: tauri::Window) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        if let Ok(hwnd) = window.hwnd() {
            let hwnd = HWND(hwnd.0 as _);
            unsafe {
                let _ = SetWindowDisplayAffinity(hwnd, WDA_NONE);
            }
        }
    }
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .invoke_handler(tauri::generate_handler![enable_capture_protection, disable_capture_protection])
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
