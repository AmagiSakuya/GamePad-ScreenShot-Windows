/**
 * 截图音效：编号 → 音频文件，以及统一的播放入口。
 *
 * 主界面（音效设置）与系统设置（覆层通知预览）都要发声，映射表放这里单一维护。
 * 两处各存一份 import 的话，改编号时很容易只改一边，导致「音效 1」在预览里是另一个声音。
 */
import { reactive } from 'vue'
import { Howl } from 'howler'
import leicaSrc from '@/assets/sound-leica-m10.wav'
import softChimeSrc from '@/assets/sound-soft-chime.wav'
import shutterSrc from '@/assets/sound-shutter.wav'
import slrClackSrc from '@/assets/sound-slr-clack.wav'
import canon5dSrc from '@/assets/sound-canon5d.wav'

const { screenshotSoundEnum } = require('@/lib/enum')

// 数字即界面上的「音效 N」，顺序不要随意调整
export const CAPTURE_SOUNDS = {
  Sound1: leicaSrc,      // 徕卡 M10 快门（96ms，默认）
  Sound2: softChimeSrc,  // 柔铃（合成，373ms）
  Sound3: shutterSrc,    // 单反快门（100ms）
  Sound4: slrClackSrc,   // 机械快门（合成，143ms）
  Sound5: canon5dSrc     // 佳能 5D 快门（164ms）
}

/**
 * 当前生效的音效设置。主界面写入，其它页面（系统设置的通知预览）直接读取，
 * 不必再去 store 里读 globalConfig —— 那份配置只在退出/开始监听时才落盘，
 * 用户刚改完就切到系统设置，读到的会是上一次的值。
 */
export const captureSoundState = reactive({
  sound: screenshotSoundEnum.Sound1,
  power: 1,
  // 是否已被主界面同步过；没同步过时系统设置页会自己去 store 读一次
  synced: false
})

export function setCaptureSound(sound, power) {
  // 只接受已知编号，避免把老存档里的 NS2 / PS 之类的值同步进来
  if (typeof sound === 'string' && (sound === screenshotSoundEnum.None || hasCaptureSound(sound))) {
    captureSoundState.sound = sound
  }
  const volume = Number(power)
  if (Number.isFinite(volume)) captureSoundState.power = volume
  captureSoundState.synced = true
}

export function hasCaptureSound(sound) {
  return Object.prototype.hasOwnProperty.call(CAPTURE_SOUNDS, sound)
}

/**
 * 播放一次截图音效。不传参数就用当前设置的音效与音量。
 * @returns {Howl|null} 静音或编号非法时返回 null
 */
export function playCaptureSound(sound = captureSoundState.sound, power = captureSoundState.power) {
  if (!sound || sound === screenshotSoundEnum.None) return null
  const src = CAPTURE_SOUNDS[sound]
  if (!src) return null
  const volume = Number(power)
  const howl = new Howl({
    src: [src],
    volume: Number.isFinite(volume) ? volume : 1,
    onend: function () {
      this.unload()
    }
  })
  howl.play()
  return howl
}
