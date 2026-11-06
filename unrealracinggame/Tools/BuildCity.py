"""Build the drivable city level from intentionally placed districts and routes."""
import math
import random

import unreal


MAP = "/Game/Maps/L_CityBlockout"
ASSETS = "/Game/Materials"
random.seed(41)


def vec(x, y, z):
    return unreal.Vector(float(x), float(y), float(z))


def mat(name, rgb, rough=0.78, metal=0.0, emissive=0.0):
    path = ASSETS + "/" + name
    if unreal.EditorAssetLibrary.does_asset_exist(path):
        asset = unreal.load_asset(path)
        asset.set_editor_property("used_with_instanced_static_meshes", True)
        asset.set_editor_property("used_with_static_lighting", True)
        unreal.EditorAssetLibrary.save_loaded_asset(asset)
        return asset
    else:
        asset = unreal.AssetToolsHelpers.get_asset_tools().create_asset(
            name, ASSETS, unreal.Material, unreal.MaterialFactoryNew())
    asset.set_editor_property("used_with_instanced_static_meshes", True)
    asset.set_editor_property("used_with_static_lighting", True)
    for prop, value, y in ((unreal.MaterialProperty.MP_BASE_COLOR, rgb, 0),
                           (unreal.MaterialProperty.MP_ROUGHNESS, rough, 120),
                           (unreal.MaterialProperty.MP_METALLIC, metal, 240)):
        kind = unreal.MaterialExpressionConstant3Vector if isinstance(value, tuple) else unreal.MaterialExpressionConstant
        node = unreal.MaterialEditingLibrary.create_material_expression(asset, kind, -350, y)
        if isinstance(value, tuple):
            node.set_editor_property("constant", unreal.LinearColor(*value, 1))
        else:
            node.set_editor_property("r", value)
        unreal.MaterialEditingLibrary.connect_material_property(node, "", prop)
    if emissive:
        node = unreal.MaterialEditingLibrary.create_material_expression(
            asset, unreal.MaterialExpressionConstant3Vector, -350, 360)
        node.set_editor_property("constant", unreal.LinearColor(
            rgb[0] * emissive, rgb[1] * emissive, rgb[2] * emissive, 1))
        unreal.MaterialEditingLibrary.connect_material_property(
            node, "", unreal.MaterialProperty.MP_EMISSIVE_COLOR)
    unreal.MaterialEditingLibrary.recompile_material(asset)
    unreal.EditorAssetLibrary.save_loaded_asset(asset)
    return asset


def box(group, surface, x, y, z, sx, sy, sz, yaw=0, pitch=0, collision=False):
    city.add_piece(group, cube, surface, vec(x, y, z),
                   unreal.Rotator(roll=0, pitch=pitch, yaw=yaw),
                   vec(sx, sy, sz), collision)


def sphere(group, surface, x, y, z, sx, sy, sz):
    city.add_piece(group, globe, surface, vec(x, y, z),
                   unreal.Rotator(0, 0, 0), vec(sx, sy, sz), False)


def cyl(group, surface, x, y, z, radius, height, collision=False):
    city.add_piece(group, cylinder, surface, vec(x, y, z),
                   unreal.Rotator(0, 0, 0), vec(radius * 2, radius * 2, height), collision)


def beam(group, surface, a, b, thickness):
    dx, dy, dz = b[0] - a[0], b[1] - a[1], b[2] - a[2]
    length = math.sqrt(dx * dx + dy * dy + dz * dz)
    box(group, surface, (a[0] + b[0]) / 2, (a[1] + b[1]) / 2,
        (a[2] + b[2]) / 2, length, thickness, thickness,
        math.degrees(math.atan2(dy, dx)), math.degrees(math.atan2(dz, math.hypot(dx, dy))))


def road_point_distance(x, y, a, b):
    vx, vy = b[0] - a[0], b[1] - a[1]
    t = max(0, min(1, ((x - a[0]) * vx + (y - a[1]) * vy) / (vx * vx + vy * vy)))
    return math.hypot(x - a[0] - t * vx, y - a[1] - t * vy)


def road_clear(x, y, half_extent):
    if abs(x) < 4800 or abs(x) > 47000 or abs(y) > 46000:
        return False
    for points, width, _ in routes:
        for a, b in zip(points, points[1:]):
            if road_point_distance(x, y, a, b) < width / 2 + half_extent + 350:
                return False
    return True


def plot_clear(x, y, margin):
    return all(abs(x - px) > pw / 2 + margin or abs(y - py) > pd / 2 + margin
               for px, py, pw, pd in plots)


def roadway(label, points, width, boulevard=False):
    for index, (a, b) in enumerate(zip(points, points[1:])):
        dx, dy = b[0] - a[0], b[1] - a[1]
        distance = math.hypot(dx, dy)
        pieces = max(1, math.ceil(distance / 1600))
        yaw = math.degrees(math.atan2(dy, dx))
        nx, ny = -dy / distance, dx / distance
        for step in range(pieces):
            t0, t1 = step / pieces, (step + 1) / pieces
            mx, my = a[0] + dx * (t0 + t1) / 2, a[1] + dy * (t0 + t1) / 2
            length = distance / pieces + 4
            box("RoadSurface", asphalt, mx, my, -18, length, width, 36, yaw, collision=True)
            for side in (-1, 1):
                edge = width / 2 + 145
                box("Sidewalk", walkway, mx + nx * edge, my + ny * edge,
                    -4, length, 250, 12, yaw)
                line = width / 2 - 35
                box("EdgePaint", white, mx + nx * line * side, my + ny * line * side,
                    1.5, length - 8, 11, 1, yaw)
            if boulevard:
                for lane in (-width / 4, width / 4):
                    box("LanePaint", white, mx + nx * lane, my + ny * lane,
                        1.8, length * 0.45, 11, 1, yaw)
                for offset in (-24, 24):
                    box("CenterPaint", yellow, mx + nx * offset, my + ny * offset,
                        1.8, length - 12, 9, 1, yaw)
            else:
                box("CenterPaint", yellow, mx, my, 1.8,
                    length * 0.5, 12, 1, yaw)
        if index:
            cyl("IntersectionPad", asphalt, a[0], a[1], -18,
                width * (1.5 if a in shared_nodes else 0.55), 36, collision=True)


def deck_height(x):
    if x < -3500:
        t = (x + 9500) / 6000
    elif x > 3500:
        t = (9500 - x) / 6000
    else:
        return 240
    t = max(0, min(1, t))
    return 240 * (3 * t * t - 2 * t * t * t)


def bridge():
    for i, x0 in enumerate(range(-9500, 9500, 200)):
        x1 = x0 + 200
        z0, z1 = deck_height(x0), deck_height(x1)
        pitch = math.degrees(math.atan2(z1 - z0, x1 - x0))
        x = (x0 + x1) / 2
        box("BridgeDeck", asphalt, x, 0, (z0 + z1) / 2 - 25,
            210, 1800, 50, pitch=pitch, collision=True)
        for side in (-1, 1):
            box("BridgeEdgePaint", white, x, side * 850, (z0 + z1) / 2 + 2,
                205, 12, 1, pitch=pitch)
            box("BridgeWalk", walkway, x, side * 1000, (z0 + z1) / 2,
                205, 150, 14, pitch=pitch)
            box("BridgeBarrier", concrete, x, side * 1100, (z0 + z1) / 2 + 45,
                205, 28, 95, pitch=pitch, collision=True)
        if i % 4 < 2:
            for y in (-430, 430):
                box("BridgeLanePaint", white, x, y, (z0 + z1) / 2 + 3,
                    198, 10, 1, pitch=pitch)
        for y in (-25, 25):
            box("BridgeCenterPaint", yellow, x, y, (z0 + z1) / 2 + 3,
                205, 10, 1, pitch=pitch)
    for px in (-2500, 2500):
        for side in (-1, 1):
            y = side * 1120
            box("BridgePylon", concrete, px, y, 3350,
                175, 175, 6200, collision=True)
            box("BridgePylonCap", concrete, px, y, 6350,
                300, 230, 90)
            for tip in range(-6500, 6501, 1300):
                if abs(tip - px) < 1000:
                    continue
                beam("BridgeCables", steel,
                     (px, y, 6000), (tip, side * 1080, deck_height(tip) + 80), 17)
    for px in (-9500, 9500):
        for side in (-1, 1):
            box("BridgePortal", concrete, px, side * 1120, 350,
                220, 220, 650)


def building(kind, x, y, width, depth, height, serial):
    if not road_clear(x, y, max(width, depth) * 0.55):
        return False
    for old_x, old_y, old_w, old_d in plots:
        if abs(x - old_x) < (width + old_w) * 0.5 + 220 and abs(y - old_y) < (depth + old_d) * 0.5 + 220:
            return False
    plots.append((x, y, width, depth))
    palette = office_colors if kind in ("office", "landmark") else apartment_colors if kind == "apartment" else shop_colors
    body = palette[serial % len(palette)]
    if kind in ("office", "landmark"):
        podium = 500
    elif kind == "apartment":
        podium = 400
    else:
        podium = min(400, height * 0.25)
    base_z = -6
    box("BuildingBody_%s" % body.get_name(), body,
        x, y, base_z + height / 2, width, depth, height, collision=True)
    box("BuildingPlinth", dark_stone, x, y, base_z + 65,
        width + 45, depth + 45, 130, collision=True)
    box("BuildingPodium", concrete if kind == "apartment" else dark_stone,
        x, y, base_z + podium / 2, width + 50, depth + 50, podium)
    floor = 360 if kind in ("office", "landmark") else 330
    floors = max(2, int((height - podium) / floor))
    nx = max(2, int((width - 250) / (330 if kind in ("office", "landmark") else 380)))
    ny = max(2, int((depth - 250) / 390))
    glass = glass_colors[serial % len(glass_colors)]
    if kind in ("office", "landmark", "apartment"):
        for side in (-1, 1):
            box("LobbyGlazing", glass, x, y + side * (depth / 2 + 10), 205,
                width * 0.76, 14, 320)
            box("LobbyCanopies", steel, x, y + side * (depth / 2 + 95), 390,
                width * 0.36, 170, 30)
    for level in range(floors):
        z = podium + level * floor + floor * 0.52
        if z > height - 120:
            break
        # Window panels are shallow, repeated as instanced geometry.
        for col in range(nx):
            u = -width / 2 + (col + 0.5) * width / nx
            for side in (-1, 1):
                box("Windows_%s" % glass.get_name(), glass,
                    x + u, y + side * (depth / 2 + 3), z,
                    width / nx * 0.76, 8, floor * 0.65)
        for col in range(ny):
            u = -depth / 2 + (col + 0.5) * depth / ny
            for side in (-1, 1):
                box("Windows_%s" % glass.get_name(), glass,
                    x + side * (width / 2 + 3), y + u, z,
                    8, depth / ny * 0.73, floor * 0.65)
    box("RoofParapet", concrete, x, y, height + 55,
        width + 35, depth + 35, 95)
    box("RoofCap", roof, x, y, height + 105, width - 75, depth - 75, 20)
    if kind in ("office", "landmark"):
        if serial % 4 == 0:
            for side_x in (-1, 1):
                for side_y in (-1, 1):
                    box("OfficeCornerFins", steel,
                        x + side_x * (width / 2 + 7),
                        y + side_y * (depth / 2 + 7), height / 2,
                        65, 65, height)
        elif serial % 4 == 1:
            for level in range(4, floors, 5):
                z = podium + level * floor
                for side in (-1, 1):
                    box("OfficeSpandrels", concrete, x,
                        y + side * (depth / 2 + 12), z,
                        width + 50, 25, 36)
        box("RoofEquipment", steel, x - width * 0.22, y, height + 210,
            width * 0.22, depth * 0.28, 210)
        box("RoofEquipment", steel, x + width * 0.18, y + depth * 0.16, height + 170,
            width * 0.14, depth * 0.22, 130)
        if kind == "landmark":
            box("LandmarkCrown", glass, x, y, height + 850,
                width * 0.65, depth * 0.65, 1500)
            box("LandmarkSpire", steel, x, y, height + 2200, 75, 75, 1400)
    elif kind == "apartment":
        for side in (-1, 1):
            for level in range(2, floors, 2):
                z = podium + level * floor + 30
                box("BalconySlabs", concrete, x, y + side * (depth / 2 + 75), z,
                    width * 0.73, 150, 24)
    else:
        box("ShopCanopy", awning_colors[serial % len(awning_colors)],
            x, y - depth / 2 - 90, 390, width * 0.84, 180, 35)
        box("ShopfrontGlass", glass, x, y - depth / 2 - 7, 205,
            width * 0.78, 12, 280)
    return True


def planted_tree(x, y, scale, serial):
    if not road_clear(x, y, 110) or not plot_clear(x, y, 170):
        return False
    trunk_height = 540 * scale
    cyl("TreeTrunks", bark, x, y, trunk_height / 2 - 6, 55 * scale, trunk_height)
    shape = random.Random(serial + 771)
    for branch in range(7):
        angle = branch * math.tau / 7 + shape.uniform(-0.16, 0.16)
        spread = shape.uniform(220, 420) * scale
        height = trunk_height + shape.uniform(-80, 260) * scale
        bx = x + math.cos(angle) * spread
        by = y + math.sin(angle) * spread
        beam("TreeBranches", bark, (x, y, trunk_height * 0.58),
             (bx, by, height), 26 * scale)
    for cluster in range(13):
        angle = cluster * math.tau / 13 + shape.uniform(-0.22, 0.22)
        spread = shape.uniform(140, 450)
        dx, dy = math.cos(angle) * spread, math.sin(angle) * spread
        dz = shape.uniform(20, 410)
        size = shape.uniform(260, 390)
        leaf = leaves[(serial + cluster // 3) % len(leaves)]
        sphere("TreeCanopy_%s" % leaf.get_name(), leaf,
               x + dx * scale, y + dy * scale, trunk_height + dz * scale,
               size * scale, size * scale,
               size * scale * shape.uniform(0.55, 0.85))
    return True


def lamp(x, y, yaw):
    cyl("LampPoles", steel, x, y, 364, 20, 740)
    rad = math.radians(yaw)
    dx, dy = 180 * math.cos(rad), 180 * math.sin(rad)
    beam("LampArms", steel, (x, y, 720), (x + dx, y + dy, 720), 28)
    box("LampHeads", light, x + dx, y + dy, 710, 170, 55, 20, yaw)


def traffic_signal(x, y, yaw, axis, phase_offset=0):
    actor = unreal.EditorLevelLibrary.spawn_actor_from_class(
        unreal.CityTrafficSignal, vec(x, y, 0), unreal.Rotator(0, 0, yaw))
    actor.set_editor_property("axis", axis)
    actor.set_editor_property("phase_offset", phase_offset)
    actor.set_actor_label("TrafficSignal_%d_%d_%d" % (x, y, axis))


unreal.EditorAssetLibrary.make_directory(ASSETS)
if unreal.EditorAssetLibrary.does_asset_exist(MAP):
    unreal.EditorLevelLibrary.load_level(MAP)
    for actor in unreal.EditorLevelLibrary.get_all_level_actors():
        unreal.EditorLevelLibrary.destroy_actor(actor)
else:
    unreal.EditorLevelLibrary.new_level(MAP)

cube = unreal.load_asset("/Engine/BasicShapes/Cube.Cube")
globe = unreal.load_asset("/Engine/BasicShapes/Sphere.Sphere")
cylinder = unreal.load_asset("/Engine/BasicShapes/Cylinder.Cylinder")
asphalt = mat("M_CityAsphalt", (0.067, 0.073, 0.080))
walkway = mat("M_CitySidewalk", (0.34, 0.35, 0.34))
concrete = mat("M_CityConcrete", (0.43, 0.44, 0.43))
dark_stone = mat("M_CityDarkStone", (0.15, 0.18, 0.20))
steel = mat("M_CitySteel", (0.21, 0.25, 0.27), 0.42, 0.7)
roof = mat("M_CityRoof", (0.15, 0.17, 0.18))
white = mat("M_CityRoadWhite", (0.74, 0.73, 0.67))
yellow = mat("M_CityRoadYellow", (0.76, 0.57, 0.18))
grass = mat("M_CityGrass", (0.18, 0.27, 0.15))
water = mat("M_CityWater", (0.04, 0.12, 0.16), 0.22, 0.1)
bark = mat("M_CityBark", (0.20, 0.13, 0.075))
light = mat("M_CityLampGlow", (0.90, 0.75, 0.47), 0.2, emissive=5)
signal_red = mat("M_TrafficRed", (0.72, 0.025, 0.018), 0.22, emissive=2)
signal_amber = mat("M_TrafficAmber", (0.45, 0.22, 0.018), 0.3)
signal_green = mat("M_TrafficGreen", (0.018, 0.28, 0.08), 0.3)
office_colors = [mat("M_Office_%d" % i, color, 0.35, 0.28) for i, color in enumerate(
    ((0.10, 0.18, 0.23), (0.17, 0.21, 0.24), (0.20, 0.25, 0.26),
     (0.10, 0.14, 0.20), (0.27, 0.29, 0.28)))]
apartment_colors = [mat("M_Apartment_%d" % i, color) for i, color in enumerate(
    ((0.57, 0.54, 0.48), (0.50, 0.45, 0.42), (0.37, 0.40, 0.39),
     (0.48, 0.50, 0.47), (0.62, 0.60, 0.55)))]
shop_colors = [mat("M_Shop_%d" % i, color) for i, color in enumerate(
    ((0.44, 0.26, 0.20), (0.33, 0.36, 0.38), (0.57, 0.48, 0.37),
     (0.35, 0.32, 0.28), (0.47, 0.41, 0.39)))]
glass_colors = [mat("M_Glass_%d" % i, color, 0.18, 0.52, 0.08) for i, color in enumerate(
    ((0.10, 0.25, 0.32), (0.19, 0.29, 0.36), (0.29, 0.32, 0.34),
     (0.14, 0.22, 0.27), (0.28, 0.36, 0.37)))]
awning_colors = [mat("M_Awning_%d" % i, color) for i, color in enumerate(
    ((0.37, 0.11, 0.08), (0.08, 0.28, 0.31), (0.38, 0.32, 0.15)))]
leaves = [mat("M_Leaves_%d" % i, color) for i, color in enumerate(
    ((0.17, 0.31, 0.14), (0.25, 0.38, 0.16), (0.13, 0.28, 0.17),
     (0.29, 0.38, 0.20)))]

city = unreal.EditorLevelLibrary.spawn_actor_from_class(
    unreal.CityInstancedGeometry, vec(0, 0, 0))
city.set_actor_label("City_Instanced_Architecture_and_Details")

# One square kilometre, split by the river; roads and bridge meet at surface height.
box("WestGround", grass, -26500, 0, -51, 47000, 100000, 100, collision=True)
box("EastGround", grass, 26500, 0, -51, 47000, 100000, 100, collision=True)
box("Riverbed", water, 0, 0, -300, 6000, 100000, 30)
for bank in (-3050, 3050):
    box("RiverBanks", concrete, bank, 0, -22, 110, 100000, 75)
    for y in (-25700, 25700):
        box("RiverGuard", steel, bank, y, 65, 35, 47600, 130, collision=True)
for side in (-1, 1):
    box("WorldEdge", concrete, side * 49600, 0, 65, 70, 100000, 130, collision=True)
    box("WorldEdge", concrete, 0, side * 49600, 65, 100000, 70, 130, collision=True)

routes = [
    ([(-44000, 0), (-26000, 0), (-9500, 0)], 1800, True),
    ([(9500, 0), (26000, 0), (30000, 0), (40000, 0), (44000, 0)], 1800, True),
    ([(-44000, 0), (-40000, 16000), (-30000, 30000),
      (-17000, 30000), (-9500, 0)], 1400, False),
    ([(-44000, 0), (-38000, -18000), (-26000, -32000),
      (-13000, -28000), (-9500, 0)], 1400, False),
    ([(9500, 0), (14000, 20000), (27000, 32000),
      (42000, 28000), (44000, 0)], 1500, False),
    ([(9500, 0), (15000, -20000), (30000, -34000),
      (42000, -24000), (44000, 0)], 1500, False),
    ([(-30000, 30000), (-26000, 0), (-26000, -32000)], 1200, False),
    ([(30000, 0), (30000, -7500), (40000, -7500), (40000, 0)], 1200, False),
]
node_counts = {}
for path, _, _ in routes:
    for point in path:
        node_counts[point] = node_counts.get(point, 0) + 1
shared_nodes = {point for point, count in node_counts.items() if count > 1}
rounded_routes = []
for path, width, boulevard in routes:
    rounded = [path[0]]
    for index in range(1, len(path) - 1):
        before, corner, after = path[index - 1:index + 2]
        if corner in shared_nodes:
            rounded.append(corner)
            continue
        incoming = (corner[0] - before[0], corner[1] - before[1])
        outgoing = (after[0] - corner[0], after[1] - corner[1])
        in_length = math.hypot(*incoming)
        out_length = math.hypot(*outgoing)
        trim = min(5000, in_length * 0.3, out_length * 0.3)
        entry = (corner[0] - incoming[0] * trim / in_length,
                 corner[1] - incoming[1] * trim / in_length)
        exit = (corner[0] + outgoing[0] * trim / out_length,
                corner[1] + outgoing[1] * trim / out_length)
        rounded.append(entry)
        for t in (0.25, 0.5, 0.75):
            rounded.append(((1 - t) ** 2 * entry[0] + 2 * (1 - t) * t * corner[0] + t * t * exit[0],
                            (1 - t) ** 2 * entry[1] + 2 * (1 - t) * t * corner[1] + t * t * exit[1]))
        rounded.append(exit)
    rounded.append(path[-1])
    rounded_routes.append((rounded, width, boulevard))
routes = rounded_routes
for index, (path, width, boulevard) in enumerate(routes):
    roadway("Route_%02d" % index, path, width, boulevard)
bridge()

# The visible road pieces and the directed lane graph share these same route points.
segments = [(a, b, width, boulevard)
            for path, width, boulevard in routes for a, b in zip(path, path[1:])]
bridge_points = [(x, 0, deck_height(x)) for x in range(-9500, 9501, 1000)]
segments.extend((a, b, 1800, True) for a, b in zip(bridge_points, bridge_points[1:]))
city.set_map_bounds(unreal.Vector2D(-50000, -50000), unreal.Vector2D(50000, 50000))
signal_nodes = {(-26000, 0): 0, (-9500, 0): 1, (9500, 0): 2}
incoming = {}
outgoing = {}
lane_links = []
seen_edges = set()
road_length = 0.0
for a, b, width, boulevard in segments:
    a_key, b_key = tuple(a[:2]), tuple(b[:2])
    edge_key = tuple(sorted((a_key, b_key)))
    if edge_key in seen_edges:
        continue
    seen_edges.add(edge_key)
    dx, dy = b[0] - a[0], b[1] - a[1]
    length = math.hypot(dx, dy)
    if length < 100:
        raise RuntimeError("Road segment too short: %s to %s" % (a, b))
    road_length += length
    city.add_road_edge(vec(a[0], a[1], a[2] if len(a) == 3 else 0),
                       vec(b[0], b[1], b[2] if len(b) == 3 else 0))
    nx, ny = -dy / length, dx / length
    for direction in (1, -1):
        origin, target = (a, b) if direction == 1 else (b, a)
        origin_key, target_key = tuple(origin[:2]), tuple(target[:2])
        offset = -direction * width / 4
        start = vec(origin[0] + nx * offset, origin[1] + ny * offset,
                    origin[2] if len(origin) == 3 else 0)
        end = vec(target[0] + nx * offset, target[1] + ny * offset,
                  target[2] if len(target) == 3 else 0)
        signal_id = signal_nodes.get(target_key, -1)
        signal_axis = int(abs(dx) < abs(dy)) if signal_id >= 0 else -1
        lane_id = city.add_lane(start, end, 70 if boulevard else 45,
                                signal_id, signal_axis)
        incoming.setdefault(target_key, []).append(lane_id)
        outgoing.setdefault(origin_key, []).append(lane_id)
        lane_links.append((origin_key, target_key, edge_key))

next_lanes = []
for lane_id, (origin, target, edge_key) in enumerate(lane_links):
    choices = [other for other in outgoing[target]
               if lane_links[other][2] != edge_key]
    if not choices:
        choices = outgoing[target]
    for other in choices:
        city.connect_lanes(lane_id, other)
    next_lanes.append(choices)

def reachable(first, links):
    found, pending = set(), [first]
    while pending:
        lane = pending.pop()
        if lane not in found:
            found.add(lane)
            pending.extend(links[lane])
    return found

reverse_lanes = [[] for _ in next_lanes]
for lane_id, choices in enumerate(next_lanes):
    for other in choices:
        reverse_lanes[other].append(lane_id)
if (not 300000 <= road_length <= 500000 or
        len(reachable(0, next_lanes)) != len(next_lanes) or
        len(reachable(0, reverse_lanes)) != len(next_lanes) or
        any(not choices for choices in next_lanes)):
    raise RuntimeError("Road length or lane graph failed validation")
for second in range(32):
    east_west_green = second < 12
    north_south_green = 16 <= second < 28
    if east_west_green and north_south_green:
        raise RuntimeError("Conflicting traffic signal greens")
unreal.log("City roads: %.2f km, %d directed lanes, one connected network" %
           (road_length / 100000, len(next_lanes)))

# Hide overlapping sidewalk ends where several routes meet the main boulevard.
for junction_x in (-44000, -26000, -9500, 9500, 30000, 40000, 44000):
    box("JunctionAsphalt", asphalt, junction_x, 0, -15,
        2500, 2500, 36)

# Flat paint at principal junctions gives traffic scale without wheel bumps.
for crossing_x in (-26000, -10200, 10200):
    for side in (-1, 1):
        for stripe in range(7):
            box("CrosswalkPaint", white, crossing_x + side * (650 + stripe * 75),
                0, 4.5, 42, 1530, 1)
for crossing_x, phase_offset in ((-26000, 0), (-9500, 8), (9500, 16)):
    traffic_signal(crossing_x - 1050, -1120, 0, 0, phase_offset)
    traffic_signal(crossing_x + 1050, 1120, 180, 0, phase_offset)
    traffic_signal(crossing_x - 1120, 1050, -90, 1, phase_offset)
    traffic_signal(crossing_x + 1120, -1050, 90, 1, phase_offset)

plots = []
box("ParkingArea", asphalt, 35000, -3750, -18, 9000, 6500, 36, collision=True)
plots.append((35000, -3750, 9000, 6500))
for x in range(31300, 39000, 900):
    box("ParkingMarkings", white, x, -4600, 1, 9, 2100, 1)
serial = 0
districts = [
    ("landmark", [(-25500, 16000, 2100, 2100, 22500),
                  (-23700, 21000, 1700, 1900, 17000),
                  (-31500, 13000, 1850, 1900, 18500)]),
    ("office", [(-29200, 17500), (-23000, 15500), (-25700, 9500),
                (-30000, 9000), (-26000, 24500), (-15500, 17000),
                (-16500, 23000), (-35000, 15000), (-29000, 26000),
                (-21500, 22500), (-14500, 11500)]),
    ("apartment", [(14500, 21000), (16500, 28000), (26500, 23000),
                   (31000, 17000), (30000, 10000), (15000, 12500),
                   (26500, 16000), (12000, 26000), (34500, 26000),
                   (25000, 29500)]),
]
for kind, entries in districts:
    for entry in entries:
        if len(entry) == 5:
            x, y, width, depth, height = entry
        else:
            x, y = entry
            width = random.randint(1250, 2050)
            depth = random.randint(1300, 2200)
            height = random.randint(7000, 14000) if kind == "office" else random.randint(6500, 11000)
        building(kind, x, y, width, depth, height, serial)
        serial += 1

for district, kind, count, xr, yr, heights in (
        ("downtown", "office", 80, (-36000, -11500), (2500, 28500), (4200, 12800)),
        ("mixed", "shop", 70, (-40000, -8500), (-30000, -2500), (900, 3800)),
        ("residential", "apartment", 95, (9000, 39500), (2500, 30500), (1600, 8500)),
        ("industrial", "shop", 50, (9500, 44500), (-40000, -8000), (850, 3000))):
    placed = 0
    for attempt in range(count * 18):
        if placed >= count:
            break
        x, y = random.uniform(*xr), random.uniform(*yr)
        width = random.randint(850, 1900) if kind == "shop" else random.randint(1200, 2200)
        depth = random.randint(900, 1800) if kind == "shop" else random.randint(1250, 2200)
        height = random.randint(*heights)
        if building(kind, x, y, width, depth, height, serial):
            placed += 1
            serial += 1
    unreal.log("City district %s: %d buildings" % (district, placed))

# Trees and lamps follow road edges, with extra space at bridge approaches.
tree_count = 0
lamp_count = 0
for route_index, (path, width, _) in enumerate(routes):
    for a, b in zip(path, path[1:]):
        dx, dy = b[0] - a[0], b[1] - a[1]
        length = math.hypot(dx, dy)
        nx, ny = -dy / length, dx / length
        for step in range(1, int(length / 1400)):
            t = step * 1400 / length
            for side in (-1, 1):
                x = a[0] + dx * t + nx * side * (width / 2 + 460)
                y = a[1] + dy * t + ny * side * (width / 2 + 460)
                if abs(x) < 10500 and abs(y) < 2500:
                    continue
                if route_index > 1 and step % 3 != 0 and planted_tree(
                        x, y, random.uniform(0.75, 1.15), tree_count):
                    tree_count += 1
                if step % 4 == 0 and road_clear(x, y, 80) and plot_clear(x, y, 110):
                    lamp(x, y, math.degrees(math.atan2(-ny * side, -nx * side)))
                    lamp_count += 1

# Two quieter pockets break up the building mass and establish recognizable places.
for cx, cy, radius in ((-12000, 28000, 2100), (14500, -26000, 2500)):
    if road_clear(cx, cy, radius) and plot_clear(cx, cy, radius):
        box("PocketPark", grass, cx, cy, -2, radius * 2, radius * 2, 9)
        for i in range(8):
            angle = 2 * math.pi * i / 8
            planted_tree(cx + math.cos(angle) * radius * 0.65,
                         cy + math.sin(angle) * radius * 0.65, 0.9, i)
        for side in (-1, 1):
            box("ParkBenches", bark, cx + side * radius * 0.4, cy, 55,
                180, 55, 25)
            box("ParkBenches", bark, cx + side * radius * 0.4, cy + 30, 95,
                180, 20, 70)

start = unreal.EditorLevelLibrary.spawn_actor_from_class(
    unreal.PlayerStart, vec(-18000, -250, 180), unreal.Rotator(0, 0, 0))
start.set_actor_label("PlayerStart_West_Boulevard")
importance = unreal.EditorLevelLibrary.spawn_actor_from_class(
    unreal.LightmassImportanceVolume, vec(0, 0, 15000))
importance.set_actor_scale3d(vec(500, 500, 150))
importance.set_actor_label("City_LightmassImportance")
sun = unreal.EditorLevelLibrary.spawn_actor_from_class(
    unreal.DirectionalLight, vec(0, 0, 12000),
    unreal.Rotator(roll=0, pitch=-35, yaw=-35))
sun.set_actor_label("EveningSun")
sun_comp = sun.get_component_by_class(unreal.DirectionalLightComponent)
sun_comp.set_editor_property("mobility", unreal.ComponentMobility.STATIONARY)
sun_comp.set_editor_property("intensity", 5.5)
sun_comp.set_editor_property("atmosphere_sun_light", True)
sun_comp.set_editor_property("light_color", unreal.Color(255, 238, 218, 255))
unreal.EditorLevelLibrary.spawn_actor_from_class(
    unreal.SkyAtmosphere, vec(0, 0, 0)).set_actor_label("EveningSky")
sky = unreal.EditorLevelLibrary.spawn_actor_from_class(
    unreal.SkyLight, vec(0, 0, 5000))
sky.set_actor_label("SkyFill")
sky_comp = sky.get_component_by_class(unreal.SkyLightComponent)
sky_comp.set_editor_property("mobility", unreal.ComponentMobility.STATIONARY)
sky_comp.set_editor_property("real_time_capture", False)
sky_comp.set_editor_property("intensity", 0.7)
fog = unreal.EditorLevelLibrary.spawn_actor_from_class(
    unreal.ExponentialHeightFog, vec(0, 0, 0))
fog.set_actor_label("DistanceHaze")
fog_comp = fog.get_component_by_class(unreal.ExponentialHeightFogComponent)
fog_comp.set_editor_property("fog_density", 0.0002)
post = unreal.EditorLevelLibrary.spawn_actor_from_class(
    unreal.PostProcessVolume, vec(0, 0, 0))
post.set_actor_label("CityExposure")
post.set_editor_property("unbound", True)
settings = post.get_editor_property("settings")
settings.set_editor_property("override_auto_exposure_bias", True)
settings.set_editor_property("auto_exposure_bias", 0.2)
post.set_editor_property("settings", settings)

if not unreal.EditorLevelLibrary.save_current_level():
    raise RuntimeError("City level was not saved")
unreal.log("City built: %d buildings, %d trees, %d lamps" %
           (len(plots) - 1, tree_count, lamp_count))
