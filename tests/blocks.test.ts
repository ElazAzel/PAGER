import {describe,it,expect} from "vitest";
import {BLOCK_TYPES} from "../src/lib/types";
import {BLOCK_META,createBlock,safeHref,formatMoney} from "../src/lib/blocks";
import {messages} from "../src/lib/i18n";
describe("block authoring contract",()=>{
 it("has all 25 independently editable block types and bilingual labels",()=>{expect(BLOCK_TYPES).toHaveLength(25); for(const type of BLOCK_TYPES){const a=createBlock(type), b=createBlock(type,"en");expect(a.type).toBe(type);expect(a.id).not.toBe(b.id);expect(BLOCK_META[type].ru).toBeTruthy();expect(BLOCK_META[type].en).toBeTruthy();}});
 it("does not make new blocks paid without an author's decision",()=>{for(const type of BLOCK_TYPES)expect(createBlock(type).paid).toBe(false);});
 it("rejects executable and protocol-relative link targets",()=>{expect(safeHref("javascript:alert(1)")).toBeUndefined();expect(safeHref("//evil.example")).toBeUndefined();expect(safeHref("data:text/html,hello")).toBeUndefined();expect(safeHref("/anna")).toBe("/anna");expect(safeHref("https://example.com")).toBe("https://example.com");});
 it("has the same interface messages in both languages",()=>{expect(Object.keys(messages.ru).sort()).toEqual(Object.keys(messages.en).sort());});
 it("formats stored amounts as minor units",()=>{expect(formatMoney(1900,"USD","en")).toBe("$19");expect(formatMoney(1950,"USD","en")).toBe("$19.50");});
});
