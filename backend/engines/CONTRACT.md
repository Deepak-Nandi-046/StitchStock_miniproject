# Engine contract (agreed by all four members)
Controllers (E4 Web) call ONLY these functions. Keep signatures stable; change internals freely.

## E1 – DSA  (engines/e1-preorder/index.js)  owner: Rakshita
- enqueuePreorder({ productId, customerId, qty }) -> { preorderId, queuePosition }
- allocateNext(productId)  -> { preorderId, customerId, qty } | null   (FIFO head)
- getQueue(productId)      -> [ { preorderId, customerId, qty, position } ]

## E2 – OS  (engines/e2-safety/index.js)  owner: Karthik
- withLock(key, asyncFn)          -> result of asyncFn (one caller per key at a time)
- runInTransaction(asyncFn(conn)) -> result; BEGIN/COMMIT/ROLLBACK + deadlock retry

## E3 – DBMS  (db/ and engines/e3-audit/index.js)  owner: Vaibhavi
- db.query(sql, params, conn?)  -> rows
- recordAudit({ actor, action, entity, entityId, details }) -> void
