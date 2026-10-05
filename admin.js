const sb = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
const BUCKET = "product-images";

const $ = (id) => document.getElementById(id);
const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const fmt = (n) => "₦" + Number(n).toLocaleString("en-NG");
let products = [];
let imgs = []; // images in the form: { url, color, file?, preview? }

const parseList = (s) => [...new Set(String(s).split(",").map((x) => x.trim()).filter(Boolean))];
const urlsOf = (p) => [...new Set([...(p.images || []).map((i) => i.url), p.image].filter(Boolean))];

function renderImgs() {
  $("colorList").innerHTML = parseList($("pcolors").value).map((c) => `<option value="${esc(c)}">`).join("");
  $("imgList").innerHTML = imgs.map((im, n) => `
    <div class="imgrow">
      <img class="thumb" src="${esc(im.preview || im.url)}" alt="">
      <input list="colorList" data-color="${n}" value="${esc(im.color)}" placeholder="Colour of this photo">
      ${n ? `<button type="button" class="btn btn-light btn-sm" data-main="${n}">Main</button>` : "<small>Main image</small>"}
      <button type="button" class="btn btn-danger btn-sm" data-rm="${n}">✕</button>
    </div>`).join("");
}

$("pcolors").addEventListener("input", renderImgs);
$("imgList").addEventListener("input", (e) => {
  const f = e.target.closest("[data-color]");
  if (f) imgs[Number(f.dataset.color)].color = f.value.trim();
});
$("imgList").addEventListener("click", (e) => {
  const rm = e.target.closest("[data-rm]");
  const main = e.target.closest("[data-main]");
  if (rm) imgs.splice(Number(rm.dataset.rm), 1);
  if (main) imgs.unshift(imgs.splice(Number(main.dataset.main), 1)[0]);
  if (rm || main) renderImgs();
});
$("pimage").addEventListener("change", (e) => {
  for (const file of e.target.files) {
    if (!file.type.startsWith("image/")) { setMsg($("formMsg"), "Only image files are allowed", false); continue; }
    if (file.size > 3 * 1024 * 1024) { setMsg($("formMsg"), file.name + " is bigger than 3MB", false); continue; }
    imgs.push({ file, preview: URL.createObjectURL(file), color: "" });
  }
  e.target.value = "";
  renderImgs();
});

function setMsg(el, text, ok) { el.textContent = text; el.className = "msg " + (ok ? "ok" : "err"); }
function showLogin() { $("app").hidden = true; $("loginBox").hidden = false; }
function showApp() { $("loginBox").hidden = true; $("app").hidden = false; loadProducts(); loadOrders(); }

// ----- Login / logout -----
async function checkAdmin() {
  const { data } = await sb.rpc("is_admin");
  return data === true;
}

$("loginForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  setMsg($("loginMsg"), "", false);
  const { error } = await sb.auth.signInWithPassword({ email: $("email").value.trim(), password: $("password").value });
  if (error) return setMsg($("loginMsg"), error.message, false);
  if (!(await checkAdmin())) {
    await sb.auth.signOut();
    return setMsg($("loginMsg"), "This account is not the admin account.", false);
  }
  $("loginForm").reset();
  showApp();
});

$("logoutBtn").addEventListener("click", async () => {
  await sb.auth.signOut();
  showLogin();
});

// ----- Images (Supabase Storage) -----
async function uploadImage(file) {
  const ext = (file.name.split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "");
  const path = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const { error } = await sb.storage.from(BUCKET).upload(path, file, { contentType: file.type });
  if (error) throw error;
  return sb.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
}

async function deleteImage(url) {
  const part = url ? url.split("/" + BUCKET + "/")[1] : null;
  if (part) await sb.storage.from(BUCKET).remove([decodeURIComponent(part)]);
}

// ----- Products -----
async function loadProducts() {
  const { data, error } = await sb.from("products").select("*").order("id", { ascending: false });
  if (error) return alert(error.message);
  products = data;
  $("pcount").textContent = products.length;
  $("productRows").innerHTML = products.map((p) => `
    <tr>
      <td>${p.image ? `<img class="thumb" src="${esc(p.image)}" alt="">` : '<div class="thumb">🛍️</div>'}</td>
      <td>${esc(p.name)}</td>
      <td>${esc(p.category)}</td>
      <td>${fmt(p.price)}</td>
      <td class="actions">
        <button class="btn btn-sm" data-edit="${p.id}">Edit</button>
        <button class="btn btn-sm btn-danger" data-del="${p.id}">Delete</button>
      </td>
    </tr>`).join("") || '<tr><td colspan="5">No products yet.</td></tr>';
}

function resetForm() {
  $("productForm").reset();
  $("pid").value = "";
  $("formTitle").textContent = "Add product";
  $("cancelEdit").hidden = true;
  imgs = [];
  renderImgs();
}

$("cancelEdit").addEventListener("click", () => { resetForm(); $("formMsg").textContent = ""; });

$("productRows").addEventListener("click", async (e) => {
  const edit = e.target.closest("[data-edit]");
  const del = e.target.closest("[data-del]");
  if (edit) {
    const p = products.find((x) => x.id === Number(edit.dataset.edit));
    $("pid").value = p.id;
    $("pname").value = p.name;
    $("pcat").value = p.category;
    $("pprice").value = p.price;
    $("pdesc").value = p.description || "";
    $("pcolors").value = (p.colors || []).join(", ");
    $("psizes").value = (p.sizes || []).join(", ");
    $("pimage").value = "";
    imgs = (p.images && p.images.length ? p.images : p.image ? [{ url: p.image, color: "" }] : [])
      .map((i) => ({ url: i.url, color: i.color || "" }));
    renderImgs();
    $("formTitle").textContent = "Edit product";
    $("cancelEdit").hidden = false;
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
  if (del && confirm("Delete this product? This cannot be undone.")) {
    const p = products.find((x) => x.id === Number(del.dataset.del));
    const { error } = await sb.from("products").delete().eq("id", p.id);
    if (error) return alert(error.message);
    for (const u of urlsOf(p)) await deleteImage(u).catch(() => {});
    loadProducts();
  }
});

$("productForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const id = $("pid").value;
  const old = id ? products.find((p) => p.id === Number(id)) : null;
  const row = {
    name: $("pname").value.trim(),
    category: $("pcat").value.trim() || "General",
    price: Math.round(Number($("pprice").value)),
    description: $("pdesc").value.trim()
  };

  $("saveBtn").disabled = true;
  try {
    if (!row.name || !Number.isFinite(row.price) || row.price < 0) throw new Error("Name and a valid price are required");

    const colors = parseList($("pcolors").value);
    const finalImgs = [];
    for (const im of imgs) {
      const url = im.file ? await uploadImage(im.file) : im.url;
      let color = (im.color || "").trim();
      if (color) {
        const match = colors.find((c) => c.toLowerCase() === color.toLowerCase());
        if (match) color = match; else colors.push(color);
      }
      finalImgs.push({ url, color });
    }
    row.images = finalImgs;
    row.image = finalImgs[0] ? finalImgs[0].url : "";
    row.colors = colors;
    row.sizes = parseList($("psizes").value);

    const { error } = id
      ? await sb.from("products").update(row).eq("id", id)
      : await sb.from("products").insert(row);
    if (error) throw error;

    if (old) {
      const keep = finalImgs.map((i) => i.url);
      for (const u of urlsOf(old)) if (!keep.includes(u)) await deleteImage(u).catch(() => {});
    }
    setMsg($("formMsg"), id ? "Product updated." : "Product added.", true);
    resetForm();
    loadProducts();
  } catch (err) {
    setMsg($("formMsg"), err.message, false);
  }
  $("saveBtn").disabled = false;
});

// ----- Orders -----
async function loadOrders() {
  const { data: orders, error } = await sb.from("orders").select("*").order("id", { ascending: false });
  if (error) return alert(error.message);
  $("ocount").textContent = orders.length;
  $("orderRows").innerHTML = orders.map((o) => `
    <tr>
      <td>${o.id}<br><small>${esc(new Date(o.created_at).toLocaleString())}</small></td>
      <td>${esc(o.name)}<br><a href="tel:${esc(o.phone)}">${esc(o.phone)}</a><br>${esc(o.email)}<br>${esc(o.address)}</td>
      <td>${o.items.map((i) => `${esc(i.name)}${i.color || i.size ? ` (${esc([i.color, i.size].filter(Boolean).join(", "))})` : ""} ×${i.qty}`).join("<br>")}</td>
      <td>${fmt(o.total)}</td>
      <td><select data-status="${o.id}">
        ${["pending", "paid", "delivered", "cancelled"].map((s) => `<option ${s === o.status ? "selected" : ""}>${s}</option>`).join("")}
      </select></td>
      <td><button class="btn btn-sm btn-danger" data-delorder="${o.id}">Delete</button></td>
    </tr>`).join("") || '<tr><td colspan="6">No orders yet.</td></tr>';
}

$("orderRows").addEventListener("change", async (e) => {
  const sel = e.target.closest("[data-status]");
  if (!sel) return;
  const { error } = await sb.from("orders").update({ status: sel.value }).eq("id", sel.dataset.status);
  if (error) alert(error.message);
});

$("orderRows").addEventListener("click", async (e) => {
  const del = e.target.closest("[data-delorder]");
  if (del && confirm("Delete this order?")) {
    const { error } = await sb.from("orders").delete().eq("id", del.dataset.delorder);
    if (error) return alert(error.message);
    loadOrders();
  }
});

// ----- Start -----
(async () => {
  if (SUPABASE_URL.includes("YOUR-PROJECT")) {
    showLogin();
    return setMsg($("loginMsg"), "Add your Supabase URL and key in config.js first.", false);
  }
  const { data } = await sb.auth.getSession();
  if (data.session && (await checkAdmin())) showApp();
  else showLogin();
})();
