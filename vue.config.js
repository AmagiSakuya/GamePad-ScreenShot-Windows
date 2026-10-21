const { defineConfig } = require('@vue/cli-service')
const path = require('path')

module.exports = defineConfig({
  transpileDependencies: true,
  configureWebpack: {
    resolve: {
      alias: {
        '@': path.resolve(__dirname, 'src')
      },
      fallback: {
        "path": require.resolve("path-browserify"),
        "fs": false,
        "crypto": false,
        "stream": false,
        "assert": false,
        "http": false,
        "https": false,
        "os": false,
        "url": false
      }
    }
  },
  pluginOptions: {
    electronBuilder: {
      preload: 'src/preload.js',
      externals: ['screenshot-desktop', 'node-screenshots'],
      builderOptions: {
        "productName": "Gamepad Full-ScreenShot Tool",
        "win": {
          "icon": "src/gamepad.ico",
          "target": ["dir"]
        },
        asarUnpack: [
          'preload.js',
          'node_modules/screenshot-desktop/**',
          'node_modules/node-screenshots/**'
        ],
        extraResources: [
          {
            from: "src/gamepad.ico",
            to: "./" 
          },
          {
            from: "src/assets/recording.ico",
            to: "./assets/recording.ico" 
          },
          {
            from: "src/screenshot-notification.html",
            to: "./html/screenshot-notification.html" 
          },
          // 内置录制引擎：ffmpeg 必须作为「真实文件」放在 resources 下，
          // 不能打进 asar（子进程要从文件系统启动它）。
          // 体积约 160MB，用户装完即用，不需要另外下载。
          // 注意：热更新只替换 app.asar，这个目录动不到 ——
          // 所以升级版本号不受它影响，也不会让补丁包变大。
          {
            from: "vendor/ffmpeg/ffmpeg.exe",
            to: "./ffmpeg/ffmpeg.exe"
          },
          // 热更新助手：必须以「真实文件」的形式落在 resources 下，
          // 主进程会用它以 ELECTRON_RUN_AS_NODE 启动一个独立进程来替换 app.asar
          {
            from: "scripts/apply-update.js",
            to: "./apply-update.js"
          },
        ]
      }
    }
  }
})
