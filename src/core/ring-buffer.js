export class RingBuffer {
  constructor(capacity = 120) {
    if (!Number.isInteger(capacity) || capacity <= 0) throw new Error('capacity must be a positive integer');
    this.capacity = capacity;
    this.buffer = new Array(capacity);
    this.start = 0;
    this.length = 0;
  }

  push(value) {
    const index = (this.start + this.length) % this.capacity;
    if (this.length < this.capacity) {
      this.buffer[index] = value;
      this.length += 1;
    } else {
      this.buffer[this.start] = value;
      this.start = (this.start + 1) % this.capacity;
    }
    return value;
  }

  clear() {
    this.buffer = new Array(this.capacity);
    this.start = 0;
    this.length = 0;
  }

  toArray() {
    const values = [];
    for (let i = 0; i < this.length; i += 1) values.push(this.buffer[(this.start + i) % this.capacity]);
    return values;
  }

  get size() {
    return this.length;
  }
}
