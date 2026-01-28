module.exports = [
    {
        deviceName: "DualShock 4",
        vid: 1356,
        pid: 2508,
        parseDataFunction: function (buffer) {
            let LEFT_SHOULDER = (buffer[6] & 0x01) !== 0 // L1
            let RIGHT_SHOULDER = (buffer[6] & 0x02) !== 0 // R1
            let SELECT = (buffer[6] & 0x10) !== 0 // Share
            let START = (buffer[6] & 0x20) !== 0 // Options
            let HOME = (buffer[7] & 0x01) !== 0 // PS
            return { LEFT_SHOULDER, RIGHT_SHOULDER, SELECT, START, HOME }
        }
    },
    {
        deviceName: "DualSense 5",
        vid: 1356,
        pid: 3302,
        parseDataFunction: function (buffer) {
            let LEFT_SHOULDER = (buffer[9] & 0x01) !== 0;  // L1
            let RIGHT_SHOULDER = (buffer[9] & 0x02) !== 0; // R1
            let SELECT = (buffer[9] & 0x10) !== 0;         // Create (原 Share)
            let START = (buffer[9] & 0x20) !== 0;          // Options
            let HOME = (buffer[10] & 0x01) !== 0;           // PS Button
            return { LEFT_SHOULDER, RIGHT_SHOULDER, SELECT, START, HOME };
        }
    },
    {
        deviceName: "Nintendo Switch Pro Controller",
        vid: 0x057e,
        pid: 0x2009,
        parseDataFunction: function (buffer) {
            let LEFT_SHOULDER = (buffer[5] & (1 << 6)) !== 0;
            let RIGHT_SHOULDER = (buffer[3] & (1 << 6)) !== 0;
            let SELECT = (buffer[4] & (1 << 0)) !== 0;
            let START = (buffer[4] & (1 << 1)) !== 0;
            let HOME = (buffer[4] & (1 << 4)) !== 0;
            return { LEFT_SHOULDER, RIGHT_SHOULDER, SELECT, START, HOME };
        }
    },
    {
        deviceName: "XInput (网易UU远程)",
        vid: 1118,
        pid: 654,
        parseDataFunction: function (buffer) {
            const b10 = buffer[10]
            let LEFT_SHOULDER = (b10 & 0x10) !== 0
            let RIGHT_SHOULDER = (b10 & 0x20) !== 0
            let SELECT = (b10 & 0x40) !== 0
            let START = (b10 & 0x80) !== 0
            let HOME = false
            return { LEFT_SHOULDER, RIGHT_SHOULDER, SELECT, START, HOME }
        }
    }
]