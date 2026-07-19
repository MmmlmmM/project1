// ============================================================
// 全局应用状态管理
// ============================================================

export class AppState {
  constructor() {
    this.currentPage = 'upload';
    this.isAnalyzing = false;
    this.videoLoaded = false;
    this.videoInfo = null;
    this.listeners = [];
  }

  setPage(page) {
    this.currentPage = page;
    this.notify();
  }

  setAnalyzing(analyzing) {
    this.isAnalyzing = analyzing;
    this.notify();
  }

  setVideoLoaded(loaded, info = null) {
    this.videoLoaded = loaded;
    this.videoInfo = info;
    this.notify();
  }

  on(name, callback) {
    this.listeners.push({ name, callback });
  }

  notify() {
    this.listeners.forEach(l => l.callback(this));
  }

  off(name) {
    this.listeners = this.listeners.filter(l => l.name !== name);
  }
}
