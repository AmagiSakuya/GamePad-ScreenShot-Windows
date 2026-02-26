const fs = require('fs')
const path = require('path')
const { app } = require('electron'); 

class ConfigStore {
    constructor(fileName = 'store.json') {
        const userDataPath = app.isPackaged ? process.resourcesPath : path.join(app.getAppPath(), 'temp');

        if (!fs.existsSync(userDataPath)) {
            fs.mkdirSync(userDataPath, { recursive: true });
        }

        this.path = path.join(userDataPath, fileName);
        this.data = this.parseDataFile(this.path);
    }

    // 读取文件内容
    parseDataFile(filePath) {
        try {
            if (!fs.existsSync(filePath)) {
                return {}; // 文件不存在则返回空对象
            }
            return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
        } catch (error) {
            console.error('Config load error:', error);
            return {};
        }
    }

    // 获取值
    get(key, defaultValue) {
        return this.data[key] !== undefined ? this.data[key] : defaultValue;
    }

    // 设置值并持久化
    set(key, val) {
        this.data[key] = val;
        try {
            fs.writeFileSync(this.path, JSON.stringify(this.data, null, 4));
        } catch (error) {
            console.error('Config save error:', error);
        }
    }
}

// 导出单例
module.exports = new ConfigStore();