/**
 * Typescript port, created by KR Tirtho <krtirtho@gmail.com> © 2021
 */


export class ErizoMapClass<K = any, V = any> {
  private map = new Map();

  add = this.map.set;
  set = this.map.set;
  delete = this.map.delete;
  forEach = this.map.forEach;
  entries = this.map.entries;
  values = this.map.values;
  clear = this.map.clear;
  size = this.map.size;
  has = this.map.has;
  get = this.map.get;



  keys() {
    return Array.from<K>(this.map.keys())
  }

  remove(key: K) {
    this.map.delete(key)
  }
}

export default function ErizoMap<K = any, V = any>(): ErizoMapClass<K, V> {
  const map = new ErizoMapClass<K, V>();
  return map;
}