import { expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { link, mkdtemp, readFile, rename, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { systemFiles } from "../src/platform/file-system";
import type { LocalDirectory } from "../src/platform/files";
import { rejection } from "./fixtures/rejection";

test.if(["darwin", "win32", "linux"].includes(process.platform))("目录句柄约束读写，拒绝符号链接或目录联接逃逸与覆盖发布", async () => {
  const path = await mkdtemp(join(tmpdir(), "pikpak-files-test-"));
  const filesystem = systemFiles(); const root = await filesystem.root(path);
  try {
    const staged = await root.child("staging", true); const target = await root.child("target", true);
    try {
      const file = await staged.file("file.part", true);
      let identity;
      try { await file.write(0n, Buffer.from("synthetic")); await file.sync(); identity = (await file.info()).identity; expect(Buffer.from(await file.read(0n, 9)).toString()).toBe("synthetic"); }
      finally { await file.close(); }
      const other = await target.file("existing.bin", true); await other.close();
      expect(await staged.publish("file.part", target, "existing.bin")).toBe(false);
      expect(await staged.publish("file.part", target, "new.bin")).toBe(true);
      const published = await target.file("new.bin", false);
      try { expect((await published.info()).identity).toEqual(identity); } finally { await published.close(); }
      expect(await readFile(join(path, "target", "existing.bin"), "utf8")).toBe("");
      await symlink(tmpdir(), join(path, "escape"), process.platform === "win32" ? "junction" : "dir");
      await expect(root.child("escape", false)).rejects.toThrow();
      await expect(root.file("../outside", true)).rejects.toThrow();
      if (process.platform === "win32") await link(join(path, "target", "new.bin"), join(path, "staging", "linked"));
      else await symlink(join(path, "target", "new.bin"), join(path, "staging", "linked"));
      await expect(staged.file("linked", false)).rejects.toThrow();
      expect(await root.freeBytes()).toBeGreaterThan(0n);
    } finally { await staged.close(); await target.close(); }
  } finally { await root.close(); await filesystem.close(); await rm(path, { recursive: true, force: true }); }
});

test.if(["darwin", "win32", "linux"].includes(process.platform))("按目录句柄删除文件：只删身份相符的文件；目录被换成链接时不会删到目录之外", async () => {
  const path = await mkdtemp(join(tmpdir(), "pikpak-files-test-")), outside = await mkdtemp(join(tmpdir(), "pikpak-files-outside-"));
  const filesystem = systemFiles(); const root = await filesystem.root(path);
  const create = async (directory: LocalDirectory, name: string) => {
    const file = await directory.file(name, true);
    try { await file.write(0n, Buffer.from(name)); await file.sync(); return (await file.info()).identity; } finally { await file.close(); }
  };
  try {
    const work = await root.child("work", true);
    try {
      const first = await create(work, "first.part"), second = await create(work, "second.part");
      // 身份不符时不删除；相符时删除；已不存在时报告 ENOENT。
      expect(await work.removeFile("first.part", second)).toBe(false); expect(existsSync(join(path, "work", "first.part"))).toBe(true);
      expect(await work.removeFile("first.part", first)).toBe(true); expect(existsSync(join(path, "work", "first.part"))).toBe(false);
      expect((await rejection(work.removeFile("first.part", first)) as { code?: string }).code).toBe("ENOENT");
      expect(existsSync(join(path, "work", "second.part"))).toBe(true);
      // Windows 上打开中的目录不能改名；其他平台把目录改名并在原路径放一个指向外部的链接，删除仍发生在已打开的目录里。
      if (process.platform !== "win32") {
        await writeFile(join(outside, "second.part"), "unrelated");
        await rename(join(path, "work"), join(path, "moved")); await symlink(outside, join(path, "work"), "dir");
        expect(await work.removeFile("second.part", second)).toBe(true);
        expect(existsSync(join(path, "moved", "second.part"))).toBe(false); expect(await readFile(join(outside, "second.part"), "utf8")).toBe("unrelated");
      }
    } finally { await work.close(); }
  } finally { await root.close(); await filesystem.close(); await rm(path, { recursive: true, force: true }); await rm(outside, { recursive: true, force: true }); }
});
