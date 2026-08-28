const screenshotSoundEnum = {
    None: "None",
    NS2: "NS2",
    PS: "PS"
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
