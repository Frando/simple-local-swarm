# simple-local-swarm

A localhost-only socket swarm. Useful for IPC or local replication of data structures.
This uses unix domain sockets (or named pipes on windows) to open bidirectional streams between processes interested in a topic. A topic is a 32 byte buffer (if you pass a string, it will be hashed into a 32 byte buffer).

## Example

Below is a simple CLI example that lets any number of processes talk to each other. See [`test.js`](test.js) for an example that replicates [hypercores](https://github.com/mafintosh/hypercore).

```javascript
const Swarm = require('.')

const topic = process.argv[2]
const name = process.argv[3]

const swarm = Swarm()
swarm.join(topic)

swarm.on('connection', (stream, details) => {
  stream.on('data', data => console.log('incoming:: ' + data.toString()))
  stream.write(`hello i am ${name}`)
})
```

```bash
# in a terminal
> node example.js mytopic alice
incoming: hello i am bob
incoming: hello i am claire

# in another terminal
> node example.js mytopic bob
incoming: hello i am alice
incoming: hello i am claire

# in another terminal
> node example.js mytopic claire
incoming: hello i am alice
incoming: hello i am bob
```

## API

`const LocalSwarm = require('simple-local-swarm')`

### `const swarm = new LocalSwarm(opts)`

Open a swarm. `opts` are:
* `shortcircuit: bool` if multiple swarms from the same process are interested in a topic, connect them directly without going through sockets (default: true)
* `basedir: string` a path to a directory where to store sockets and topic files. has to be the same between all processes that want to share swarms. default: `/tmp/simple-local-swarm`

### `swarm.join(topic)`

Join a topic. `topic` can either be a 32 byte long buffer, or a string (which will be hashed into a 32 byte buffer).

### `swarm.on('connection', function (socket, details) {})`

Register a connection handler. `socket` is a binary duplex stream. `details` is an object with keys:
* `client: boolean`: true if the connection was initiated from this process, false if coming from another process

### `swarm.close(cb)`

Close the server and delete the topic file. This is also registered as an exit hook in node that when the process exits the topic file is deleted.
