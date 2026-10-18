// In-memory stand-ins for Upstash Redis (the commands web/lib/pending.js sends) and Vercel Queues' send, for
// test/vercel.test.js and the local mock (test/webdev.js). Plugged in through web/lib/pending.js's deps.
module.exports = function fakes(P) {
  const db = {}, ttl = {}, sent = [], log = { redis: 0, fail: { redis: false, send: false } };
  const live = k => { if (ttl[k] && ttl[k] <= Date.now()) { delete db[k]; delete ttl[k]; } return db[k]; };
  const cmd = ([op, k, ...a]) => {
    const h = live(k);
    switch (op) {
      case 'HGETALL': return h ? Object.keys(h).flatMap(f => [f, h[f]]) : [];
      case 'HSET': { const o = db[k] = h || {}; for (let i = 0; i < a.length; i += 2) o[a[i]] = a[i + 1]; return a.length / 2; }
      case 'HDEL': if (h) a.forEach(f => delete h[f]); return a.length;
      case 'EXPIRE': if (h) ttl[k] = Date.now() + a[0] * 1000; return h ? 1 : 0;
      case 'SET': { // SET k v NX PX ms
        if (a.includes('NX') && h !== undefined) return null;
        db[k] = a[0]; const px = a.indexOf('PX'); if (px >= 0) ttl[k] = Date.now() + Number(a[px + 1]); return 'OK';
      }
      case 'PTTL': return h === undefined ? -2 : ttl[k] ? ttl[k] - Date.now() : -1;
      case 'DEL': delete db[k]; delete ttl[k]; return 1;
      case 'SCAN': { // SCAN cursor MATCH <prefix>* COUNT n: everything in one page
        const pre = a[1].replace(/\*$/, '');
        return ['0', Object.keys(db).filter(x => x.startsWith(pre) && live(x) !== undefined)];
      }
    }
    throw new Error('fake redis: ' + op);
  };
  P.deps.redis = async cmds => { if (log.fail.redis) throw new Error('Redis down'); log.redis += cmds.length; return cmds.map(cmd); };
  P.deps.send = async (topic, payload, opts) => {
    if (log.fail.send) throw new Error('Queue down');
    sent.push({ topic, payload, opts });
    return { messageId: 'm' + sent.length };
  };
  /** Forget the per-author minute between calls (the tests don't wait a minute). */
  const unthrottle = () => Object.keys(db).filter(k => k.startsWith('pcl:')).forEach(k => { delete db[k]; delete ttl[k]; });
  return { db, sent, log, unthrottle };
};
