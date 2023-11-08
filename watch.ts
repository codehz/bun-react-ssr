import { watch } from "node:fs";

class SingleTaskPool {
  stopped = true;
  pending = false;
  constructor(public init: () => Promise<any>) {}

  #stop() {
    this.stopped = true;
    if (this.pending) {
      this.pending = false;
      this.run();
    }
  }

  run() {
    if (this.stopped) {
      this.stopped = false;
      this.init().finally(() => this.#stop());
    } else {
      this.pending = true;
    }
  }
}

export async function watchBuild(build: () => Promise<any>, paths: string[]) {
  const wrapper = new SingleTaskPool(build);
  wrapper.run();
  for (const path of paths) {
    watch(path, { recursive: true }, () => wrapper.run());
  }
}
