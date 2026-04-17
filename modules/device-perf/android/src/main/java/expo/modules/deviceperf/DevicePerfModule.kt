package expo.modules.deviceperf

import android.app.ActivityManager
import android.content.Context
import android.os.BatteryManager
import android.os.Debug
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class DevicePerfModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("DevicePerf")

    AsyncFunction("getSnapshot") {
      val context = appContext.reactContext ?: return@AsyncFunction emptyMap<String, Any?>()

      val activityManager = context.getSystemService(Context.ACTIVITY_SERVICE) as? ActivityManager
      val batteryManager = context.getSystemService(Context.BATTERY_SERVICE) as? BatteryManager

      val memInfo = ActivityManager.MemoryInfo()
      activityManager?.getMemoryInfo(memInfo)

      val ramTotalMb = (memInfo.totalMem / 1_048_576L)
      val ramAvailMb = (memInfo.availMem / 1_048_576L)
      val ramUsedMb = ramTotalMb - ramAvailMb

      val nativeHeapMb = (Debug.getNativeHeapAllocatedSize() / 1_048_576L)

      val runtime = Runtime.getRuntime()
      val jvmHeapMb = ((runtime.totalMemory() - runtime.freeMemory()) / 1_048_576L)

      val batteryPct = batteryManager?.getIntProperty(BatteryManager.BATTERY_PROPERTY_CAPACITY) ?: -1
      val batteryCurrentMicroAmps = batteryManager?.getIntProperty(BatteryManager.BATTERY_PROPERTY_CURRENT_NOW) ?: 0

      mapOf(
        "ramTotalMb" to ramTotalMb,
        "ramAvailMb" to ramAvailMb,
        "ramUsedMb" to ramUsedMb,
        "nativeHeapMb" to nativeHeapMb,
        "jvmHeapMb" to jvmHeapMb,
        "batteryPct" to batteryPct,
        "batteryCurrentMicroAmps" to Math.abs(batteryCurrentMicroAmps),
      )
    }
  }
}
