from flask import Flask, render_template, jsonify, request
import subprocess, psutil, socket, platform, re

app = Flask(__name__)
HOST_RE = re.compile(r'^[a-zA-Z0-9\.\-]+$')
TARGET_RE = re.compile(r'^[a-zA-Z0-9\.\-\/]+$')


def run(cmd, timeout):
    try:
        r = subprocess.run(cmd, capture_output=True, text=True, timeout=timeout)
        return jsonify({'output': r.stdout + r.stderr})
    except subprocess.TimeoutExpired:
        return jsonify({'error': 'Timeout'}), 408
    except FileNotFoundError:
        return jsonify({'error': f'{cmd[0]} نصب نیست'}), 500
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/')
def index():
    return render_template('index.html')


@app.route('/api/sysinfo')
def sysinfo():
    vm = psutil.virtual_memory()
    du = psutil.disk_usage('/')
    return jsonify({
        'hostname': socket.gethostname(),
        'os': platform.platform(),
        'cpu_percent': psutil.cpu_percent(interval=0.5),
        'memory': {'total': vm.total, 'used': vm.used, 'percent': vm.percent},
        'disk': {'total': du.total, 'used': du.used, 'percent': du.percent},
    })


@app.route('/api/interfaces')
def interfaces():
    addrs = psutil.net_if_addrs()
    stats = psutil.net_if_stats()
    io = psutil.net_io_counters(pernic=True)
    out = []
    for name, lst in addrs.items():
        s, c = stats.get(name), io.get(name)
        out.append({
            'name': name,
            'is_up': s.isup if s else False,
            'speed': s.speed if s else 0,
            'bytes_sent': c.bytes_sent if c else 0,
            'bytes_recv': c.bytes_recv if c else 0,
            'packets_sent': c.packets_sent if c else 0,
            'packets_recv': c.packets_recv if c else 0,
            'addresses': [{'family': str(a.family).replace('AddressFamily.', ''),
                           'address': a.address, 'netmask': a.netmask or ''} for a in lst],
        })
    return jsonify(out)


@app.route('/api/routes')
def routes():
    return run(['ip', 'route', 'show'], 5)


@app.route('/api/arp')
def arp():
    try:
        r = subprocess.run(['ip', 'neigh', 'show'], capture_output=True, text=True, timeout=5)
        entries = []
        for line in r.stdout.strip().splitlines():
            p = line.split()
            if 'lladdr' in p:
                entries.append({'ip': p[0], 'iface': p[p.index('dev') + 1],
                                'mac': p[p.index('lladdr') + 1], 'type': p[-1]})
        return jsonify(entries)
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/ping', methods=['POST'])
def ping():
    host = (request.get_json() or {}).get('host', '').strip()
    if not HOST_RE.match(host) or host.startswith('-'):
        return jsonify({'error': 'هاست نامعتبر است'}), 400
    return run(['ping', '-c', '4', '-W', '2', host], 20)


@app.route('/api/traceroute', methods=['POST'])
def traceroute():
    host = (request.get_json() or {}).get('host', '').strip()
    if not HOST_RE.match(host) or host.startswith('-'):
        return jsonify({'error': 'هاست نامعتبر است'}), 400
    return run(['traceroute', '-m', '15', host], 60)


@app.route('/api/scan', methods=['POST'])
def scan():
    d = request.get_json() or {}
    target = d.get('target', '').strip()
    if not TARGET_RE.match(target) or target.startswith('-'):
        return jsonify({'error': 'هدف نامعتبر است'}), 400
    types = {
        'quick': ['-T4', '-F', '--open'],
        'ping': ['-sn'],
        'service': ['-sV', '-T4', '-p', '1-1000'],
        'os': ['-O', '--osscan-guess', '-T4'],
    }
    return run(['nmap'] + types.get(d.get('type'), types['quick']) + [target], 120)


if __name__ == '__main__':
    app.run(host='127.0.0.1', port=5000, debug=False)
