/* Chạy: npm run test:lib */
import assert from "node:assert/strict";
import { parseCurl, toCurl, tokenize, looksLikeCurl } from "../lib/curl";
import { replaceVars, findVars, toVarMap, segmentVars } from "../lib/env-resolver";
import { paramsFromUrl, urlWithParams, shortPath } from "../lib/url-params";
import { buildRequest } from "../lib/build-request";
import { kv } from "../lib/id";
import { fixAndFormatJson } from "../lib/json-fix";
import { jsonToFormRows, jsonToRows, rowsToJson } from "../lib/json-table";
import { applyRemote, byCreatedAsc, byCreatedDesc, diffById, idsToSync } from "../lib/sync-logic";
import { checkUrl } from "../lib/url-check";
import { stringRangeAt } from "../lib/cm-select-string";
import type { RequestItem } from "../lib/types";

let passed = 0;
const failed: string[] = [];
function test(name: string, fn: () => void) {
  try {
    fn();
    passed++;
  } catch (e) {
    failed.push(name);
    console.error(`✗ ${name}\n  ${(e as Error).message}`);
  }
}

/* ---------------- env ---------------- */
test("replaceVars thay biến và báo biến thiếu", () => {
  const missing = new Set<string>();
  const out = replaceVars("{{baseUrl}}/users/{{ id }}?t={{token}}", { baseUrl: "https://a.com", id: "1" }, missing);
  assert.equal(out, "https://a.com/users/1?t={{token}}");
  assert.deepEqual([...missing], ["token"]);
});
test("findVars không trùng", () => assert.deepEqual(findVars("{{a}}{{b}}{{a}}"), ["a", "b"]));
test("toVarMap bỏ biến disabled", () => {
  assert.deepEqual(toVarMap([kv("a", "1"), kv("b", "2", false), kv("", "x")]), { a: "1" });
});
test("segmentVars", () => {
  const s = segmentVars("x{{a}}y{{b}}", { a: "1" });
  assert.equal(s.length, 4);
  assert.equal(s[1].known, true);
  assert.equal(s[3].known, false);
});

/* ---------------- url-params ---------------- */
test("paramsFromUrl", () => {
  const p = paramsFromUrl("https://a.com/x?q=hello%20world&page=2&flag#top");
  assert.deepEqual(p.map((x) => [x.key, x.value]), [["q", "hello world"], ["page", "2"], ["flag", ""]]);
});
test("urlWithParams giữ {{var}} và hash", () => {
  const url = urlWithParams("{{baseUrl}}/x?old=1#h", [kv("q", "a b"), kv("t", "{{token}}"), kv("off", "1", false)]);
  assert.equal(url, "{{baseUrl}}/x?q=a%20b&t={{token}}#h");
});
test("URL -> params -> URL giữ nguyên", () => {
  const u = "https://a.com/x?a=1&b=2";
  assert.equal(urlWithParams(u, paramsFromUrl(u)), u);
});
test("paramsFromUrl giữ param đang tắt", () => {
  const prev = [kv("a", "1"), kv("off", "x", false)];
  const p = paramsFromUrl("https://a.com?a=2", prev);
  assert.deepEqual(p.map((x) => [x.key, x.value, x.enabled]), [["a", "2", true], ["off", "x", false]]);
  assert.equal(p[0].id, prev[0].id);
});
test("shortPath", () => {
  assert.equal(shortPath("https://api.github.com/users/octocat?x=1"), "/users/octocat");
  assert.equal(shortPath("{{baseUrl}}/posts"), "/posts");
  assert.equal(shortPath("https://a.com"), "/");
  assert.equal(shortPath(""), "");
});

/* ---------------- curl ---------------- */
test("looksLikeCurl", () => {
  assert.ok(looksLikeCurl("  curl https://a.com"));
  assert.ok(!looksLikeCurl("https://a.com"));
});
test("tokenize bash quotes", () => {
  assert.deepEqual(tokenize(`curl 'a b' "c \\"d\\"" e\\ f $'g\\nh'`), ["curl", "a b", 'c "d"', "e f", "g\nh"]);
});
test("curl GET đơn giản", () => {
  const c = parseCurl("curl https://jsonplaceholder.typicode.com/posts/1");
  assert.equal(c.method, "GET");
  assert.equal(c.url, "https://jsonplaceholder.typicode.com/posts/1");
  assert.equal(c.bodyType, "none");
});
test("curl POST JSON nhiều dòng (bash)", () => {
  const c = parseCurl(`curl -X POST 'https://api.x.com/users?ref=1' \\
  -H 'Content-Type: application/json' \\
  -H 'Authorization: Bearer abc' \\
  --data-raw '{"name":"Linh","age":30}'`);
  assert.equal(c.method, "POST");
  assert.equal(c.headers.length, 2);
  assert.equal(c.headers[1].value, "Bearer abc");
  assert.equal(c.bodyType, "json");
  assert.deepEqual(JSON.parse(c.body), { name: "Linh", age: 30 });
  assert.deepEqual(c.params.map((p) => p.key), ["ref"]);
});
test("curl -d không có -X -> POST, tự nhận JSON", () => {
  const c = parseCurl(`curl https://a.com -d '{"a":1}'`);
  assert.equal(c.method, "POST");
  assert.equal(c.bodyType, "json");
});
test("curl form urlencoded", () => {
  const c = parseCurl(`curl https://a.com/login -d 'user=linh&pass=a%26b'`);
  assert.equal(c.bodyType, "form");
  assert.deepEqual(c.form.map((f) => [f.key, f.value]), [["user", "linh"], ["pass", "a&b"]]);
});
test("curl cờ ghép -sSL -XPUT -H'..'", () => {
  const c = parseCurl(`curl -sSL -XPUT -H'X-A: 1' https://a.com`);
  assert.equal(c.method, "PUT");
  assert.equal(c.headers[0].key, "X-A");
  assert.equal(c.url, "https://a.com");
});
test("curl --user -> Basic auth", () => {
  const c = parseCurl(`curl -u admin:secret https://a.com`);
  assert.equal(c.headers[0].value, "Basic " + Buffer.from("admin:secret").toString("base64"));
});
test("curl -G gắn data vào query", () => {
  const c = parseCurl(`curl -G https://a.com/search -d q=abc`);
  assert.equal(c.method, "GET");
  assert.equal(c.url, "https://a.com/search?q=abc");
});
test("curl --json", () => {
  const c = parseCurl(`curl --json '{"x":1}' https://a.com`);
  assert.equal(c.method, "POST");
  assert.ok(c.headers.some((h) => h.key === "Content-Type"));
});
test("curl Chrome 'Copy as cURL (cmd)'", () => {
  const cmd = [
    'curl ^"https://api.x.com/v1/items?id=5^" ^',
    '  -H ^"accept: application/json^" ^',
    '  -H ^"content-type: application/json^" ^',
    '  --data-raw ^"^{^\\^"name^\\^":^\\^"A B^\\^"^}^"',
  ].join("\n");
  const c = parseCurl(cmd);
  assert.equal(c.url, "https://api.x.com/v1/items?id=5");
  assert.equal(c.headers.length, 2);
  assert.equal(c.method, "POST");
  assert.deepEqual(JSON.parse(c.body), { name: "A B" });
});
test("curl -F báo warning", () => {
  const c = parseCurl(`curl -F file=@a.png https://a.com`);
  assert.equal(c.warnings.length, 1);
});
test("toCurl rồi parse lại", () => {
  const s = toCurl({ method: "POST", url: "https://a.com/x", headers: [["X-Q", "it's"]], body: `{"a":"it's"}` });
  const c = parseCurl(s);
  assert.equal(c.headers[0].value, "it's");
  assert.deepEqual(JSON.parse(c.body), { a: "it's" });
});
test("parseCurl lỗi khi không phải curl", () => assert.throws(() => parseCurl("wget x")));

/* ---------------- build-request ---------------- */
const base: RequestItem = {
  id: "1", name: "", customName: false, collectionId: null, method: "POST",
  url: "{{baseUrl}}/users", params: [], headers: [kv("X-Env", "{{env}}")],
  bodyType: "json", body: `{"t":"{{token}}"}`, form: [],
  auth: { type: "bearer", token: "{{token}}" }, createdAt: 0, updatedAt: 0,
};
test("buildRequest thay biến, auth, content-type", () => {
  const b = buildRequest(base, { baseUrl: "https://a.com", token: "T", env: "dev" });
  assert.equal(b.url, "https://a.com/users");
  assert.deepEqual(b.headers, [["X-Env", "dev"], ["Authorization", "Bearer T"], ["Content-Type", "application/json"]]);
  assert.equal(b.body, `{"t":"T"}`);
  assert.deepEqual(b.missingVars, []);
});
test("buildRequest báo biến thiếu", () => {
  const b = buildRequest(base, {});
  assert.deepEqual(b.missingVars.sort(), ["baseUrl", "env", "token"]);
});
test("buildRequest tự thêm scheme", () => {
  assert.equal(buildRequest({ ...base, url: "localhost:3000/x" }, {}).url, "http://localhost:3000/x");
  assert.equal(buildRequest({ ...base, url: "api.github.com" }, {}).url, "https://api.github.com");
});
test("buildRequest GET không gửi body", () => {
  assert.equal(buildRequest({ ...base, method: "GET" }, {}).body, undefined);
});
test("buildRequest form", () => {
  const b = buildRequest({ ...base, bodyType: "form", form: [kv("a", "1 2"), kv("b", "&")], auth: { type: "none", token: "" } }, {});
  assert.equal(b.body, "a=1+2&b=%26");
  assert.ok(b.headers.some(([k, v]) => k === "Content-Type" && v === "application/x-www-form-urlencoded"));
});

/* ---------------- json-fix ---------------- */
test("fixJson: key không có nháy kép", () => {
  const out = fixAndFormatJson(`{\n  email: "test@example.com", password: "fake-pass"\n}`);
  assert.deepEqual(JSON.parse(out!), { email: "test@example.com", password: "fake-pass" });
  assert.ok(out!.includes('\n  "password"'));
});
test("fixJson: nháy đơn, phẩy thừa, comment, thiếu phẩy", () => {
  const out = fixAndFormatJson(`{ 'a': 'x', // ghi chú\n b: [1, 2, 3,], c: true d: null, }`);
  assert.deepEqual(JSON.parse(out!), { a: "x", b: [1, 2, 3], c: true, d: null });
});
test("fixJson: giữ {{var}} trần và trong chuỗi", () => {
  const out = fixAndFormatJson(`{ id: {{userId}}, name: "Xin {{ten}}", token: '{{token}}' }`);
  assert.equal(out, `{\n  "id": {{userId}},\n  "name": "Xin {{ten}}",\n  "token": "{{token}}"\n}`);
});
test("fixJson: JSON đúng chỉ format", () => {
  assert.equal(fixAndFormatJson(`{"a":1}`), `{\n  "a": 1\n}`);
});
test("fixJson: trống -> null", () => assert.equal(fixAndFormatJson("  "), null));
test("fixJson: thiếu cả { và }", () => {
  assert.deepEqual(JSON.parse(fixAndFormatJson(`email: "a@b.com", password: "x"`)!), { email: "a@b.com", password: "x" });
});
test("fixJson: thiếu { đầu", () => {
  assert.deepEqual(JSON.parse(fixAndFormatJson(`"a": 1, b: 2 }`)!), { a: 1, b: 2 });
});
test("fixJson: thiếu } cuối", () => {
  assert.deepEqual(JSON.parse(fixAndFormatJson(`{ a: 1, b: { c: 2 }`)!), { a: 1, b: { c: 2 } });
});
test("fixJson: thiếu [ đầu", () => {
  assert.deepEqual(JSON.parse(fixAndFormatJson(`1, 2, 3]`)!), [1, 2, 3]);
});
test("fixJson: nhiều dòng thiếu { }", () => {
  assert.deepEqual(JSON.parse(fixAndFormatJson(`\n  email: "a",\n  age: 30,\n`)!), { email: "a", age: 30 });
});
test("fixJson: thiếu { } + có {{var}}", () => {
  assert.equal(fixAndFormatJson(`id: {{userId}}, name: "x"`), `{\n  "id": {{userId}},\n  "name": "x"\n}`);
});
test("fixJson: đã đủ { } thì giữ nguyên", () => {
  assert.equal(fixAndFormatJson(`{"a":{"b":1}}`), `{\n  "a": {\n    "b": 1\n  }\n}`);
});

/* ---------------- json-table ---------------- */
test("bảng -> JSON tự đoán kiểu", () => {
  const json = rowsToJson([
    kv("email", "a@b.com"), kv("age", "30"), kv("vip", "true"), kv("phone", "0912345678"),
    kv("note", ""), kv("tags", '["a","b"]'), kv("code", '"123"'), kv("off", "x", false), kv("", "bỏ"),
  ]);
  assert.deepEqual(JSON.parse(json), {
    email: "a@b.com", age: 30, vip: true, phone: "0912345678", note: "", tags: ["a", "b"], code: "123",
  });
});
test("JSON -> bảng -> JSON giữ nguyên", () => {
  const body = JSON.stringify({ email: "a", n: 1, s: "123", b: false, o: { x: 1 }, z: null }, null, 2);
  assert.equal(rowsToJson(jsonToRows(body)!), body);
});
test("JSON -> bảng: mảng/lỗi -> null, trống -> []", () => {
  assert.equal(jsonToRows("[1,2]"), null);
  assert.equal(jsonToRows("{a:1"), null);
  assert.deepEqual(jsonToRows(""), []);
});
test("JSON -> bảng: {{var}} trần", () => {
  assert.deepEqual(jsonToRows(`{"id": {{userId}}}`)!.map((r) => [r.key, r.value]), [["id", "{{userId}}"]]);
});

/* ---------------- sync-logic ---------------- */
test("diffById: thêm, sửa, xóa, không đổi", () => {
  const a = { id: "a", createdAt: 1 }, b = { id: "b", createdAt: 2 }, c = { id: "c", createdAt: 3 };
  const b2 = { ...b };
  const d = diffById([a, b, c], [a, b2, { id: "d", createdAt: 4 }]);
  assert.deepEqual(d.upserted.sort(), ["b", "d"]);
  assert.deepEqual(d.removed, ["c"]);
  assert.deepEqual(diffById([a], [a]), { upserted: [], removed: [] });
});
test("applyRemote: áp thay đổi, bỏ qua id đang chờ ghi, sắp xếp", () => {
  const cur = [{ id: "a", createdAt: 1, v: 1 }, { id: "b", createdAt: 2, v: 1 }];
  const next = applyRemote(
    cur,
    [
      { type: "modified", id: "a", data: { id: "a", createdAt: 1, v: 9 } },
      { type: "modified", id: "b", data: { id: "b", createdAt: 2, v: 9 } }, // đang gõ -> bỏ qua
      { type: "added", id: "c", data: { id: "c", createdAt: 3, v: 1 } },
    ],
    (id) => id === "b",
    byCreatedDesc,
  );
  assert.deepEqual(next.map((x) => [x.id, x.v]), [["c", 1], ["b", 1], ["a", 9]]);
});
test("applyRemote: xóa; không có gì đổi thì giữ nguyên mảng", () => {
  const cur = [{ id: "a", createdAt: 1 }];
  assert.deepEqual(applyRemote(cur, [{ type: "removed", id: "a" }], () => false, byCreatedAsc), []);
  assert.equal(applyRemote(cur, [{ type: "removed", id: "zz" }], () => false, byCreatedAsc), cur);
});

test("idsToSync: request chỉ trên máy không ghi cloud, trừ lúc đổi trạng thái", () => {
  type R = { id: string; createdAt: number; localOnly?: boolean };
  const cloud: R = { id: "c", createdAt: 1 };
  const local: R = { id: "l", createdAt: 2, localOnly: true };
  // sửa request local -> không ghi
  assert.deepEqual(idsToSync([cloud, local], [cloud, { ...local, x: 1 } as typeof local]), []);
  // xóa request local -> không ghi
  assert.deepEqual(idsToSync([cloud, local], [cloud]), []);
  // sửa request cloud -> ghi
  assert.deepEqual(idsToSync([cloud], [{ ...cloud }]), ["c"]);
  // cloud -> chỉ trên máy: cần ghi (để xóa bản trên cloud)
  assert.deepEqual(idsToSync([cloud], [{ ...cloud, localOnly: true }]), ["c"]);
  // chỉ trên máy -> cloud: cần ghi (đẩy lên)
  assert.deepEqual(idsToSync([local], [{ ...local, localOnly: false }]), ["l"]);
  // tạo mới request local -> không ghi
  assert.deepEqual(idsToSync([], [local]), []);
});

/* ---------------- url-check ---------------- */
const fixUrl = (s: string) => checkUrl(s).fixed;
test("url: link đúng -> không báo", () => {
  for (const ok of [
    "http://103.159.51.199:8080/api/v1/auth/staff/login",
    "https://api.github.com/users?q=a%20b&page=2#top",
    "{{baseUrl}}/users/{{id}}?t={{token}}",
    "localhost:3000/x",
    "",
  ]) assert.deepEqual(checkUrl(ok), { issues: [], fixed: null }, ok);
});
test("url: khoảng trắng đầu/cuối/giữa", () => {
  assert.equal(fixUrl("  http://103.159.51.199:8080/api/v1/auth/ staff/login  "), "http://103.159.51.199:8080/api/v1/auth/staff/login");
  assert.equal(fixUrl("http://103.159.51. 199:8080/api"), "http://103.159.51.199:8080/api");
  assert.equal(fixUrl("https://a.com/search?q= xin chào &page = 2"), "https://a.com/search?q=xin%20chào&page=2");
});
test("url: scheme gõ sai", () => {
  assert.equal(fixUrl("http//a.com/x"), "http://a.com/x");
  assert.equal(fixUrl("http:/a.com/x"), "http://a.com/x");
  assert.equal(fixUrl("htp://a.com"), "http://a.com");
  assert.equal(fixUrl("https:\\\\a.com\\x\\y"), "https://a.com/x/y");
  assert.equal(fixUrl("http;//a.com"), "http://a.com");
  assert.equal(fixUrl("http://http://a.com"), "http://a.com");
});
test("url: // thừa, dấu phẩy trong IP, : thừa", () => {
  assert.equal(fixUrl("http://a.com:8080//api///v1"), "http://a.com:8080/api/v1");
  assert.equal(fixUrl("http://103,159,51,199:8080/api"), "http://103.159.51.199:8080/api");
  assert.equal(fixUrl("http://a.com::8080/x"), "http://a.com:8080/x");
});
test("url: query thừa ? & ", () => {
  assert.equal(fixUrl("https://a.com/x?a=1?b=2"), "https://a.com/x?a=1&b=2");
  assert.equal(fixUrl("https://a.com/x?&a=1&&b=2&"), "https://a.com/x?a=1&b=2");
  assert.equal(fixUrl("https://a.com/x?"), "https://a.com/x");
});
test("url: nháy, full-width, giữ {{var}}", () => {
  assert.equal(fixUrl(`"https://a.com/x"`), "https://a.com/x");
  assert.equal(fixUrl("<https://a.com/x>"), "https://a.com/x");
  assert.equal(fixUrl("https：／／a.com"), "https://a.com");
  assert.equal(fixUrl("{{baseUrl}}//users/ {{id}}"), "{{baseUrl}}/users/{{id}}");
});
test("url: có báo lý do", () => {
  const r = checkUrl("http//103,159,51,199:8080/api/ v1");
  assert.ok(r.issues.length >= 3, r.issues.join(" | "));
});

/* ---------------- double-click chọn chuỗi ---------------- */
test("stringRangeAt: chọn cả email trong chuỗi", () => {
  const line = `  "email": "test.user@example.com",`;
  const col = line.indexOf("user"); // click vào giữa email
  const r = stringRangeAt(line, col)!;
  assert.equal(line.slice(r[0], r[1]), "test.user@example.com");
});
test("stringRangeAt: click vào key, chuỗi có \\\", ngoài chuỗi", () => {
  const line = `  "pass": "a\\"b.c", n: 123`;
  assert.equal(line.slice(...stringRangeAt(line, 4)!), "pass");
  assert.equal(line.slice(...stringRangeAt(line, line.indexOf("b.c"))!), `a\\"b.c`);
  assert.equal(stringRangeAt(line, line.indexOf("123")), null);
});

/* ---------------- JSON -> Form ---------------- */
test("jsonToFormRows: kiểu giá trị", () => {
  const rows = jsonToFormRows(JSON.stringify({ email: "a@b.com", code: "123", age: 30, vip: true, z: null, o: { x: 1 } }));
  assert.deepEqual(rows!.map((r) => [r.key, r.value]), [
    ["email", "a@b.com"], ["code", "123"], ["age", "30"], ["vip", "true"], ["z", "null"], ["o", '{"x":1}'],
  ]);
});
test("jsonToFormRows: {{var}}, JSON thiếu nháy key", () => {
  assert.deepEqual(jsonToFormRows(`{"id": {{userId}}}`)!.map((r) => r.value), ["{{userId}}"]);
  assert.deepEqual(jsonToFormRows(`{ email: "a", pass: "b" }`)!.map((r) => r.key), ["email", "pass"]);
});
test("jsonToFormRows: mảng / trống / không sửa được -> null", () => {
  assert.equal(jsonToFormRows("[1,2]"), null);
  assert.equal(jsonToFormRows("  "), null);
  assert.equal(jsonToFormRows("abc"), null);
});

console.log(`\n${passed} passed, ${failed.length} failed`);
if (failed.length) process.exit(1);
