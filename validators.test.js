// تست ساده‌ی قوانین اعتبارسنجی: node validators.test.js
const V = require("./validators"), a = require("assert");
a.equal(V.email("a@b.co"), ""); a(V.email("abc")); a(V.email(""));
a(V.password("short1")); a(V.password("onlyletters!!")); a(V.password("1234567890123")); a.equal(V.password("abcdefgh12"), ""); a.equal(V.password("رمزعبور۱۲۳۴۵۶"), "");
a(V.name("", true)); a.equal(V.name("", false), ""); a(V.name("x".repeat(51), true));
a(V.confirm("a", "b")); a.equal(V.confirm("a", "a"), "");
console.log("validators ok");
