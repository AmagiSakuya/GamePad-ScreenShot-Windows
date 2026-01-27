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
    HOME: 'HOME',        // Xbox/PS/Home
    // 肩键和扳机键
    LEFT_SHOULDER: 'LEFT_SHOULDER',      // LB (Xbox), L1 (PS), L (NS)
    RIGHT_SHOULDER: 'RIGHT_SHOULDER',    // RB (Xbox), R1 (PS), R (NS)
    // 功能按钮
    START: 'START',      // Start/Menu
    SELECT: 'SELECT',    // Select/View
    
    //SOUTH: 'SOUTH',      // A (Xbox), Cross (PS), B (NS)
    //EAST: 'EAST',        // B (Xbox), Circle (PS), A (NS)
    //WEST: 'WEST',        // X (Xbox), Square (PS), Y (NS)
    //NORTH: 'NORTH',      // Y (Xbox), Triangle (PS), X (NS)
    // D-Pad
    //DPAD_UP: 'DPAD_UP',
    //DPAD_DOWN: 'DPAD_DOWN',
    //DPAD_LEFT: 'DPAD_LEFT',
    //DPAD_RIGHT: 'DPAD_RIGHT',
    //LEFT_TRIGGER: 'LEFT_TRIGGER',        // LT (Xbox), L2 (PS), ZL (NS)
    //RIGHT_TRIGGER: 'RIGHT_TRIGGER',      // RT (Xbox), R2 (PS), ZR (NS)
    //TOUCHPAD: 'PS_TOUCHPAD',
    // 摇杆按钮
    //LEFT_STICK: 'LEFT_STICK',    // L3
    //RIGHT_STICK: 'RIGHT_STICK',  // R3
}

module.exports = { resolutionEnum, screenshotSoundEnum, CommonButtonEnum }