import { describe, expect, it } from "bun:test";
import { fromShortUuid, toShortUuid, uuidv4 } from "./index.js";

describe("uuidv4", () => {
  it("有効なUUID v4文字列を生成できること", () => {
    const uuid = uuidv4();

    // UUID v4 の形式をチェック (8-4-4-4-12文字の16進数)
    const uuidRegex =
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    expect(uuid).toMatch(uuidRegex);
  });

  it("一意のUUIDを生成できること", () => {
    const uuid1 = uuidv4();
    const uuid2 = uuidv4();

    expect(uuid1).not.toBe(uuid2);
  });

  it("正しいバージョンビット（バージョン4）を持つこと", () => {
    const uuid = uuidv4();
    const versionChar = uuid.charAt(14); // バージョンビットの位置

    expect(versionChar).toBe("4");
  });

  it("正しいバリアントビットを持つこと", () => {
    const uuid = uuidv4();
    const variantChar = uuid.charAt(19); // バリアントビットの位置

    // バリアントビットは 8, 9, A, B のいずれかである必要がある
    expect(["8", "9", "a", "b", "A", "B"]).toContain(variantChar);
  });

  it("連続して複数の一意なUUIDを生成できること", () => {
    const uuids = new Set();
    const count = 1000;

    for (let i = 0; i < count; i++) {
      uuids.add(uuidv4());
    }

    // 1000個すべてが重複していないことを確認
    expect(uuids.size).toBe(count);
  });
});

describe("toShortUuid / fromShortUuid", () => {
  it("UUID を 22文字のURLセーフ文字列に短縮できること", () => {
    const uuid = uuidv4();
    const short = toShortUuid(uuid)._unsafeUnwrap();
    expect(short).toMatch(/^[A-Za-z0-9_-]{22}$/);
  });

  it("短縮文字列から元のUUIDに復元できること", () => {
    const uuid = uuidv4();
    const short = toShortUuid(uuid)._unsafeUnwrap();
    const restored = fromShortUuid(short)._unsafeUnwrap();
    expect(restored.toLowerCase()).toBe(uuid.toLowerCase());
  });

  it("連続生成でも一意性が保たれ復元可能であること", () => {
    const count = 200;
    const set = new Set<string>();
    for (let i = 0; i < count; i++) {
      const short = toShortUuid(uuidv4())._unsafeUnwrap();
      expect(short).toMatch(/^[A-Za-z0-9_-]{22}$/);
      set.add(short);
    }
    expect(set.size).toBe(count);
  });

  it("ゼロUUIDの既知ケースでも期待通りになること", () => {
    const zero = "00000000-0000-0000-0000-000000000000";
    const short = toShortUuid(zero)._unsafeUnwrap();
    expect(short).toBe("AAAAAAAAAAAAAAAAAAAAAA");
    const restored = fromShortUuid(short)._unsafeUnwrap();
    expect(restored).toBe(zero);
  });
});
