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

export function watchBuild(build: () => Promise<any>, paths: string[]) {
  const wrapper = new SingleTaskPool(build);
  wrapper.run();
  return paths.map((path) =>
    watch(path, { recursive: true }, () => wrapper.run())
  );
}
