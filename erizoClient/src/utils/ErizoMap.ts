export class ErizoMapClass<K = any, V = any> extends Map<K, V> {
  add = super.set;

  keysArr() {
    return Array.from<K>(super.keys())
  }

  remove(key: K) {
    super.delete(key)
  }
}

export type ErizoMapFunctionConstructor<K, V> = Omit<ErizoMapClass<K, V>, "keysArr" | "keys"> & {
  keys(): K[];
};

export default function ErizoMap<K = any, V = any>(): ErizoMapFunctionConstructor<K, V> {
  const map = new ErizoMapClass<K, V>();
  Object.assign(map.keys, map.keysArr)
  delete (map as any).keysArr
  return map as unknown as ErizoMapFunctionConstructor<K, V>
}