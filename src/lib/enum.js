const screenshotSoundEnum = {
    None: "None",
    Sound1: "Sound1",
    Sound2: "Sound2",
    Sound3: "Sound3",
    Sound4: "Sound4",
    Sound5: "Sound5"
}

const CommonButtonEnum = {
    Home: 'Home',
    L1: 'L1', 
    R1: 'R1',
    Start: 'Start',
    Select: 'Select'
}


const ScreenShotWayEnum = {
    DesktopCapturer: 'Default',
    OBS: 'OBS', 
}

const CaptureTargetTypeEnum = {
    Screen: 'screen',
    Window: 'window'
}

const ScreenShotSaveWayEnum = {
    FileOnly: 'file',
    CilpboardOnly: 'clipboard',
    FileAndCilpboard: 'fileAndClipboard'
}


module.exports = { screenshotSoundEnum, CommonButtonEnum, ScreenShotWayEnum, ScreenShotSaveWayEnum, CaptureTargetTypeEnum }
