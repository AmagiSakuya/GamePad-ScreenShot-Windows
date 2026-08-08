const resolutionEnum = {
    R_1080P: "1080P (1920x1080)",
    R_2K: "2K (2560x1440)",
    R_4K: "4K (3840x2160)"
}

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

const ScreenShotSaveWayEnum = {
    FileOnly: 'file',
    CilpboardOnly: 'clipboard',
    FileAndCilpboard: 'fileAndClipboard'
}


module.exports = { resolutionEnum, screenshotSoundEnum, CommonButtonEnum, ScreenShotWayEnum, ScreenShotSaveWayEnum }