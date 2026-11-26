const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const { randomUUID } = require('node:crypto');
const root = __dirname, uploads = path.join(root, 'data', 'uploads');
fs.mkdirSync(uploads, { recursive: true });
const db = new DatabaseSync(path.join(root, 'data', 'menu.sqlite'));
db.exec('CREATE TABLE IF NOT EXISTS dishes (id TEXT PRIMARY KEY, name TEXT NOT NULL, image TEXT NOT NULL, recipe TEXT DEFAULT "", created_at TEXT NOT NULL)');
db.exec('PRAGMA foreign_keys=ON; CREATE TABLE IF NOT EXISTS dish_ingredients (dish_id TEXT NOT NULL REFERENCES dishes(id) ON DELETE CASCADE, position INTEGER NOT NULL, name TEXT NOT NULL, PRIMARY KEY (dish_id, position))');
if (!db.prepare('PRAGMA table_info(dishes)').all().some(column => column.name === 'sort_order')) {
 db.exec('ALTER TABLE dishes ADD COLUMN sort_order INTEGER');
 const existing = db.prepare('SELECT id FROM dishes ORDER BY created_at DESC, rowid DESC').all();
 const update = db.prepare('UPDATE dishes SET sort_order=? WHERE id=?');
 db.exec('BEGIN');
 try { existing.forEach((dish, index) => update.run(index, dish.id)); db.exec('COMMIT'); }
 catch (err) { db.exec('ROLLBACK'); throw err; }
}
const send = (res, status, body, type = 'application/json; charset=utf-8') => { res.writeHead(status, { 'Content-Type': type, 'X-Content-Type-Options': 'nosniff' }); res.end(body); };
function listDishes() {
 const dishes=db.prepare('SELECT id,name,image,recipe FROM dishes ORDER BY sort_order, rowid').all();
 const ingredients=db.prepare('SELECT dish_id,name FROM dish_ingredients ORDER BY dish_id,position').all();
 const grouped=new Map(dishes.map(d=>[d.id,[]]));
 for(const item of ingredients) grouped.get(item.dish_id)?.push(item.name);
 return dishes.map(d=>({...d,ingredients:grouped.get(d.id)}));
}
http.createServer(async (req, res) => {
 try {
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname === '/api/capabilities' && req.method === 'GET') return send(res,200,JSON.stringify({ingredients:true}));
  if ((url.pathname === '/api/admin/dishes' || url.pathname === '/api/dishes') && req.method === 'GET') return send(res, 200, JSON.stringify(listDishes()));
  if (url.pathname === '/api/dishes/order' && req.method === 'PUT') {
   let body = ''; for await (const chunk of req) { body += chunk; if (body.length > 1000000) return send(res, 413, '{}'); }
   let ids; try { ids = JSON.parse(body); } catch { return send(res, 400, JSON.stringify({error:'排序数据无效。'})); }
   const current = db.prepare('SELECT id FROM dishes').all().map(d => d.id);
   if (!Array.isArray(ids) || ids.length !== current.length || new Set(ids).size !== current.length || ids.some(id => !current.includes(id))) return send(res, 400, JSON.stringify({error:'菜品列表已变化，请刷新后重试。'}));
   const update = db.prepare('UPDATE dishes SET sort_order=? WHERE id=?');
   db.exec('BEGIN'); try { ids.forEach((id, index) => update.run(index, id)); db.exec('COMMIT'); } catch (err) { db.exec('ROLLBACK'); throw err; }
   return send(res, 200, '{}');
  }
  if (url.pathname === '/api/dishes' && req.method === 'POST') {
   const form = await new Request('http://localhost', { method:'POST', headers:req.headers, body:req, duplex:'half' }).formData();
   const id = String(form.get('id') || ''), name = String(form.get('name') || '').trim(), photo = form.get('photo');
   const old = id && db.prepare('SELECT * FROM dishes WHERE id=?').get(id);
   const recipe = form.has('recipe') ? String(form.get('recipe')).trim() : (old?.recipe || '');
   const ingredientValues = form.has('ingredients_present') ? form.getAll('ingredients').map(value => typeof value === 'string' ? value.trim() : '').filter(Boolean) : null;
   if (ingredientValues && (ingredientValues.length > 100 || ingredientValues.some(value => value.length > 80))) return send(res,400,JSON.stringify({error:'材料最多填写 100 项，每项不超过 80 字。'}));
   if (!name || name.length > 80 || (id && !old)) return send(res, 400, JSON.stringify({error:'请填写有效的菜名。'}));
   let image = old?.image;
   if (photo && photo.size) {
    const types = {'image/jpeg':'.jpg','image/png':'.png','image/webp':'.webp','image/gif':'.gif'};
    if (!types[photo.type] || photo.size > 10 * 1024 * 1024) return send(res, 400, JSON.stringify({error:'请选择 10 MB 以内的 JPG、PNG、WebP 或 GIF 图片。'}));
    image = randomUUID() + types[photo.type]; fs.writeFileSync(path.join(uploads, image), Buffer.from(await photo.arrayBuffer()));
   }
   if (!image) return send(res, 400, JSON.stringify({error:'请选择菜品照片。'}));
   const dishId=old?id:randomUUID();
   db.exec('BEGIN');
   try {
    if (old) db.prepare('UPDATE dishes SET name=?, image=?, recipe=? WHERE id=?').run(name,image,recipe,id);
    else db.prepare('INSERT INTO dishes (id,name,image,recipe,created_at,sort_order) VALUES (?,?,?,?,?,(SELECT COALESCE(MAX(sort_order),-1)+1 FROM dishes))').run(dishId,name,image,recipe,new Date().toISOString());
    if(ingredientValues){db.prepare('DELETE FROM dish_ingredients WHERE dish_id=?').run(dishId);const insert=db.prepare('INSERT INTO dish_ingredients (dish_id,position,name) VALUES (?,?,?)');ingredientValues.forEach((value,index)=>insert.run(dishId,index,value))}
    db.exec('COMMIT');
   } catch(err) { db.exec('ROLLBACK'); if(image!==old?.image)fs.rmSync(path.join(uploads,image),{force:true}); throw err; }
   if (old && old.image !== image) fs.rmSync(path.join(uploads, old.image), {force:true});
   return send(res, 200, '{}');
  }
  if (url.pathname.startsWith('/api/dishes/') && req.method === 'DELETE') {
   const id = url.pathname.slice('/api/dishes/'.length), old = db.prepare('SELECT * FROM dishes WHERE id=?').get(id);
   if (!old) return send(res, 404, '{}');
   db.prepare('DELETE FROM dishes WHERE id=?').run(id); fs.rmSync(path.join(uploads, old.image), {force:true}); return send(res, 200, '{}');
  }
  if (req.method !== 'GET') return send(res, 405, '{}');
  const isUpload = url.pathname.startsWith('/uploads/');
  const name = isUpload ? path.basename(url.pathname) : (url.pathname === '/' ? 'index.html' : path.basename(url.pathname));
  const file = path.join(isUpload ? uploads : path.join(root,'public'), name);
  const ext = path.extname(file).toLowerCase();
  const types = {'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.jpg':'image/jpeg','.png':'image/png','.webp':'image/webp','.gif':'image/gif'};
  if (!fs.existsSync(file) || !types[ext]) return send(res,404,'Not found','text/plain');
  send(res,200,fs.readFileSync(file),types[ext]);
 } catch (err) { console.error(err); send(res,500,JSON.stringify({error:'操作失败，请重试。'})); }
}).listen(3000, '127.0.0.1', () => console.log('菜单已启动：http://localhost:3000'));
