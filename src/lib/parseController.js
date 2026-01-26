function parseDS4(data) {
    // ---- Axes ----
    const axes = {
        lx: (data[1] - 128) / 128,
        ly: (data[2] - 128) / 128,
        rx: (data[3] - 128) / 128,
        ry: (data[4] - 128) / 128,
        lt: data[8] / 255,
        rt: data[9] / 255
    }

    // ---- Buttons ----
    const buttons = []

    // Face buttons
    buttons[0] = (data[5] & 0x10) !== 0 // Square
    buttons[1] = (data[5] & 0x20) !== 0 // Cross
    buttons[2] = (data[5] & 0x40) !== 0 // Circle
    buttons[3] = (data[5] & 0x80) !== 0 // Triangle

    // Shoulder / system
    buttons[4] = (data[6] & 0x01) !== 0 // L1
    buttons[5] = (data[6] & 0x02) !== 0 // R1
    buttons[6] = (data[6] & 0x02) !== 0 && data[8] > 0 // L2 digital (兼容)
    buttons[7] = (data[6] & 0x08) !== 0 // R2 digital
    buttons[8] = (data[6] & 0x10) !== 0 // Share
    buttons[9] = (data[6] & 0x20) !== 0 // Options
    buttons[10] = (data[6] & 0x40) !== 0 // L3
    buttons[11] = (data[6] & 0x80) !== 0 // R3

    // PS / Touch
    buttons[12] = (data[7] & 0x01) !== 0 // PS
    buttons[13] = (data[7] & 0x02) !== 0 // Touchpad

    return { buttons, axes }
}

function parseUURemoteXbox(data) {
    // ---- Axes ----
  const axes = {
    lx: data.readInt16LE(0) / 32767,
    ly: data.readInt16LE(2) / 32767,
    rx: data.readInt16LE(4) / 32767,
    ry: data.readInt16LE(6) / 32767
  }

  // ---- Buttons LOW ----
  const b10 = data[10]
  const buttons = {
    A:      (b10 & 0x01) !== 0,
    B:      (b10 & 0x02) !== 0,
    X:      (b10 & 0x04) !== 0,
    Y:      (b10 & 0x08) !== 0,
    L1:     (b10 & 0x10) !== 0,
    R1:     (b10 & 0x20) !== 0,
    SELECT: (b10 & 0x40) !== 0,
    START:  (b10 & 0x80) !== 0
  }

  // ---- Buttons HIGH ----
  const b11 = data[11]
  buttons.L3 = (b11 & 0x01) !== 0
  buttons.R3 = (b11 & 0x02) !== 0

  const dpadCode = (b11 >> 2) & 0x07
  const dpad = {
    up:    dpadCode === 1,
    right: dpadCode === 3,
    down:  dpadCode === 5,
    left:  dpadCode === 7
  }

  return { axes, buttons, dpad }
}

module.exports = { parseDS4, parseUURemoteXbox };