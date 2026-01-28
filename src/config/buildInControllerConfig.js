module.exports = [
    {
        deviceName: "DualShock 4",
        vid: 0x054c,
        pid: 0x09cc,
        buttons: {
            L1: {
                buffer: 6,
                bit: 0
            },
            R1: {
                buffer: 6,
                bit: 1
            },
            Select: {
                buffer: 6,
                bit: 4
            },
            Start: {
                buffer: 6,
                bit: 5
            },
            Home: {
                buffer: 7,
                bit: 0
            }
        }
    },
    {
        deviceName: "DualSense 5",
        vid: 0x054c,
        pid: 0x0ce6,
        buttons: {
            L1: {
                buffer: 9,
                bit: 0
            },
            R1: {
                buffer: 9,
                bit: 1
            },
            Select: {
                buffer: 9,
                bit: 4
            },
            Start: {
                buffer: 9,
                bit: 5
            },
            Home: {
                buffer: 10,
                bit: 0
            }
        }
    },
    {
        deviceName: "Switch Pro Controller",
        vid: 0x057e,
        pid: 0x2009,
        buttons: {
            L1: {
                buffer: 5,
                bit: 6
            },
            R1: {
                buffer: 3,
                bit: 6
            },
            Select: {
                buffer: 4,
                bit: 0
            },
            Start: {
                buffer: 4,
                bit: 1
            },
            Home: {
                buffer: 4,
                bit: 4
            }
        }
    },
    {
        deviceName: "Xbox",
        vid: 0x045e,
        pid: 0x028e,
        buttons: {
            L1: {
                buffer: 10,
                bit: 4
            },
            R1: {
                buffer: 10,
                bit: 5
            },
            Select: {
                buffer: 10,
                bit: 6
            },
            Start: {
                buffer: 10,
                bit: 7
            }
        }
    }
]