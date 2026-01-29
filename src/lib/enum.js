const resolutionEnum = {
    R_1080P: "1080P (1920x1080)",
    R_2K: "2K (2560x1440)",
    R_4K: "4K (3840x2160)"
}

const screenshotSoundEnum = {
    None: "静音",
    NS2: "Nintendo Switch 2"
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

module.exports = { resolutionEnum, screenshotSoundEnum, CommonButtonEnum, ScreenShotWayEnum }