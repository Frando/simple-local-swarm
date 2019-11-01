const tape = require('tape')
const crypto = require('crypto')
const Swarm = require('.')
const ram = require('random-access-memory')

const hypercore = require('hypercore')

tape('hypercore', async t => {
  const feedA1 = await create()
  const feedA2 = await create(feedA1.key)
  const feedA3 = await create(feedA1.key)

  await append(feedA1, 'first')
  await append(feedA1, 'second')

  const sw1 = new Swarm()
  const sw2 = new Swarm()
  const sw3 = new Swarm({ shortcircuit: false })

  sw1.join(topic('foo'))
  sw2.join(topic('foo'))

  sw2.join(topic('bar'))
  sw3.join(topic('bar'))

  replicator(sw1, feedA1)
  replicator(sw2, feedA2)
  replicator(sw3, feedA3)

  feedA3.on('sync', () => {
    t.equal(feedA3.length, 2, 'feed synced')
    feedA3.get(1, (err, str) => {
      t.error(err)
      t.equal(str, 'second')
      cleanup([sw1, sw2, sw3], t.end)
    })
  })
})

function cleanup (swarms, cb) {
  let pending = swarms.length
  swarms.forEach(s => s.close(done))
  function done () {
    if (--pending === 0) cb()
  }
}

function replicator (swarm, feed) {
  swarm.on('connection', (socket, details) => {
    const initiator = !!details.client
    const stream = feed.replicate(initiator, { live: true })
    stream.pipe(socket).pipe(stream)
  })
}

async function create (key) {
  const feed = hypercore(ram, key, { valueEncoding: 'utf8' })
  return new Promise(resolve => feed.ready(() => resolve(feed)))
}

async function append (feed, value) {
  return new Promise((resolve, reject) => {
    feed.append(value, err => err ? reject(err) : resolve())
  })
}

function topic (str) {
  const key = crypto.createHash('sha256')
    .update(str)
    .digest()
  return key
}
