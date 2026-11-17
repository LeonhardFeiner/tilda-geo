import json, sys
from pyproj import Transformer
W, F, O = sys.argv[1:4]
G = json.load(open(f'{W}/georef.json')); A, B, TX, TY = G['a'], G['b'], G['tx'], G['ty']
t = Transformer.from_crs(4326, 25832, always_xy=True); f = 110 / 72
def px(lon, lat):
    E, N = t.transform(lon, lat); E, N = E - TX, N - TY; d = A * A + B * B
    X, Y = (A * E + B * N) / d, (-B * E + A * N) / d
    return [(0.11994 * X + 11.334341) * f, (5677.823326 - 0.11994 * Y) * f]
fc = json.load(open(F))
for ft in fc['features']: ft['geometry']['coordinates'] = [px(*c) for c in ft['geometry']['coordinates']]
json.dump(fc, open(O, 'w'))
