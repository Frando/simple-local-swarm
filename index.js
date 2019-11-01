const p = require('path')
const fs = require('fs')
const net = require('net')
const os = require('os')
const crypto = require('crypto')
const { PassThrough } = require('stream')
const { EventEmitter } = require('events')

const thunky = require('thunky')
const Nanoresource = require('nanoresource')
const exitHook = require('async-exit-hook')
const duplexify = require('duplexify')

const swarms = {}
let cnt = 0

function createLocalSwarm (opts) {
  return new LocalSwarm(opts)
}

class LocalServer extends Nanoresource {
  constructor (sockfile, onconnection) {
    super()
    this.sockfile = sockfile
    this.server = net.createServer(onconnection)
  }

  _open (cb) {
    this.server.listen(this.sockfile, cb)
  }

  _close (cb) {
    this.server.close(cb)
  }
}

class TopicFile extends Nanoresource {
  constructor (filepath) {
    super()
    this.filepath = filepath
  }

  append (line) {
    fs.appendFile(this.filepath, line + '\n', noop)
  }

  _close (cb) {
    fs.unlink(this.filepath, cb)
  }
}

class LocalSwarm extends EventEmitter {
  constructor (opts = {}) {
    super()
    this.basedir = opts.basedir || p.join(os.tmpdir(), 'simple-local-swarm')
    this.name = `${process.pid}-${++cnt}`
    this.shortcircuit = defaultTrue(opts.shortcircuit)
    this.connections = {}

    const sockpath = p.join(this.basedir, this.name) + '.sock'
    const topicpath = p.join(this.basedir, this.name) + '.topics'

    this.server = new LocalServer(sockpath, this._onconnection.bind(this))
    this.topics = new TopicFile(topicpath)

    exitHook(this.close.bind(this))
    this.open = thunky(this._open.bind(this))
    this._opened = false

    swarms[this.name] = this
  }

  join (topic, opts) {
    const self = this
    if (!Buffer.isBuffer(topic)) topic = hash(topic)
    const topicstr = topic.toString('hex')
    this.open(() => {
      this.topics.append(topicstr)
      this._findPeers(topicstr, onpeers)
    })

    function onpeers (err, peers) {
      if (err) return self.emit('error', err)
      peers.forEach(peer => self._connect(peer))
    }
  }

  leave (topic, opts) {
    // TODO.
  }

  close (cb) {
    if (this._closed) return cb()
    this._closed = true
    Object.values(this.connections).forEach(conn => conn.end())
    this.server.close(() => {
      this.topics.close(cb)
    })
  }

  _open (cb) {
    fs.mkdir(this.basedir, err => {
      if (err && err.code !== 'EEXIST') return cb(err)
      this.server.open(() => {
        this.topics.open(cb)
      })
    })
  }

  _findPeers (topic, cb) {
    const self = this
    const peers = []
    let pending = 1
    fs.readdir(this.basedir, ondirlist)

    function ondirlist (err, list) {
      if (err) return done(err)

      const topicfiles = list.map(name => {
        const matches = name.match(/^([0-9-]+)\.topics$/)
        return matches ? matches[1] : null
      }).filter(name => name && name !== self.name)

      pending += topicfiles.length
      topicfiles.forEach(name => ontopicfile(name, done))
      done()
    }

    function ontopicfile (name, cb) {
      const filepath = p.join(self.basedir, name + '.topics')
      fs.readFile(filepath, (err, buf) => {
        if (err) return cb(err)
        const topics = buf.toString().split('\n')
        if (topics.indexOf(topic) !== -1) {
          cb(null, name)
        } else cb()
      })
    }

    function done (err, peer) {
      if (err) self.emit('error', err)
      if (peer) peers.push(peer)
      if (--pending === 0) cb(null, peers)
    }
  }

  _connect (name) {
    if (this.connections[name]) return
    if (this.shortcircuit && swarms[name]) return this._shortcircuit(name)
    const pid = name.split('-')[0]
    if (!pidIsRunning(pid)) return

    const sockpath = p.join(this.basedir, name + '.sock')
    const stream = net.createConnection(sockpath)
    stream.on('error', err => this.emit('error', err))
    this._onconnection(stream, { client: true, peer: name })
  }

  _shortcircuit (name) {
    if (!swarms[name]) return
    const [local, remote] = duplexPair()
    swarms[name]._onconnection(remote, { client: false, peer: this.name })
    this._onconnection(local, { client: true, peer: name })
  }

  _onconnection (stream, details) {
    details = details || { client: false }
    if (details.peer) this.connections[details.peer] = stream
    this.emit('connection', stream, details)
  }
}

function pidIsRunning (pid) {
  try {
    return process.kill(pid, 0)
  } catch (e) {
    return e.code === 'EPERM'
  }
}

function duplexPair () {
  const s1read = new PassThrough()
  const s1write = new PassThrough()
  const s2write = new PassThrough()
  const s2read = new PassThrough()
  const s1 = duplexify(s1write, s1read)
  const s2 = duplexify(s2write, s2read)
  s2write.pipe(s1read)
  s1write.pipe(s2read)
  return [s1, s2]
}

function defaultTrue (val) {
  return typeof val === 'undefined' ? true : !!val
}

function hash (str) {
  return crypto.createHash('sha256').update(str).digest()
}

function noop () {}

module.exports = Object.assign(createLocalSwarm, { LocalSwarm })
