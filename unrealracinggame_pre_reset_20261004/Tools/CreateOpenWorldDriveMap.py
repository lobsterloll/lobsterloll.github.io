"""Build a fictional open driving map with a city hub, six-lane express route, and drag strip."""
import math
import random
import unreal

MAP_PATH = "/Game/RacingMVP/Maps/L_OpenWorldDrive"
MATERIAL_ROOT = "/Game/RacingMVP/World/Materials"
PHYSICAL_ROOT = "/Game/RacingMVP/World/Physics"
MAP_HALF_X = 55000
MAP_HALF_Y = 50000
ROAD_Z = -18
random.seed(304)


def make_material(name, rgb, roughness=0.8, metallic=0.0):
    path = MATERIAL_ROOT + "/" + name
    if unreal.EditorAssetLibrary.does_asset_exist(path):
        material = unreal.load_asset(path)
    else:
        material = unreal.AssetToolsHelpers.get_asset_tools().create_asset(
            name, MATERIAL_ROOT, unreal.Material, unreal.MaterialFactoryNew())
        color = unreal.MaterialEditingLibrary.create_material_expression(
            material, unreal.MaterialExpressionConstant3Vector, -420, 0)
        color.set_editor_property("constant", unreal.LinearColor(rgb[0], rgb[1], rgb[2], 1.0))
        unreal.MaterialEditingLibrary.connect_material_property(color, "", unreal.MaterialProperty.MP_BASE_COLOR)
        rough = unreal.MaterialEditingLibrary.create_material_expression(
            material, unreal.MaterialExpressionConstant, -420, 170)
        rough.set_editor_property("r", roughness)
        unreal.MaterialEditingLibrary.connect_material_property(rough, "", unreal.MaterialProperty.MP_ROUGHNESS)
        metal = unreal.MaterialEditingLibrary.create_material_expression(
            material, unreal.MaterialExpressionConstant, -420, 320)
        metal.set_editor_property("r", metallic)
        unreal.MaterialEditingLibrary.connect_material_property(metal, "", unreal.MaterialProperty.MP_METALLIC)
    material.set_editor_property("used_with_instanced_static_meshes", True)
    unreal.MaterialEditingLibrary.recompile_material(material)
    unreal.EditorAssetLibrary.save_loaded_asset(material)
    return material


def make_physical(name, friction, surface_value):
    path = PHYSICAL_ROOT + "/PM_P3" + name
    if unreal.EditorAssetLibrary.does_asset_exist(path):
        physical = unreal.load_asset(path)
    else:
        physical = unreal.AssetToolsHelpers.get_asset_tools().create_asset(
            "PM_P3" + name, PHYSICAL_ROOT, unreal.PhysicalMaterial, unreal.PhysicalMaterialFactoryNew())
    physical.set_editor_property("friction", friction)
    physical.set_editor_property("restitution", 0.02)
    physical.set_editor_property("surface_type", surface_value)
    unreal.EditorAssetLibrary.save_loaded_asset(physical)
    return physical


def name_token(value):
    return ("Neg" + str(abs(value))) if value < 0 else ("Pos" + str(value))


def node_id(x, y):
    return "J_" + name_token(x) + "_" + name_token(y)


def vector(x, y, z):
    return unreal.Vector(float(x), float(y), float(z))


def spawn_layer(label, cube, material, physical=None, collision=False):
    actor = unreal.EditorLevelLibrary.spawn_actor_from_class(
        unreal.P3CityInstanceLayer, vector(0, 0, 0), unreal.Rotator(0, 0, 0))
    if not actor:
        raise RuntimeError("Could not spawn P3 instance layer: " + label)
    actor.set_actor_label("P3_" + label)
    actor.configure_layer(cube, material, physical, collision)
    return actor


def box(layer, x, y, z, sx, sy, sz, yaw=0):
    return layer.add_world_instance(vector(x, y, z), unreal.Rotator(0, yaw, 0),
                                    vector(sx / 100.0, sy / 100.0, sz / 100.0))


def split_intervals(start, end, cuts):
    """Return line segments with intersection clearances removed."""
    intervals = []
    cursor = start
    for center, half_gap in sorted(cuts):
        gap_start = max(start, center - half_gap)
        gap_end = min(end, center + half_gap)
        if gap_start > cursor:
            intervals.append((cursor, gap_start))
        cursor = max(cursor, gap_end)
    if cursor < end:
        intervals.append((cursor, end))
    return intervals


def create_lane(lane_id, start_node, end_node, points, speed, stop_distance=0.0, spawn=False, safe_uturn=False):
    actor = unreal.EditorLevelLibrary.spawn_actor_from_class(
        unreal.RoadLaneSpline, vector(0, 0, 0), unreal.Rotator(0, 0, 0))
    if not actor:
        raise RuntimeError("Could not spawn road spline: " + lane_id)
    actor.set_actor_label("P3_Lane_" + lane_id)
    actor.set_editor_property("lane_id", unreal.Name(lane_id))
    actor.set_editor_property("start_node_id", unreal.Name(start_node))
    actor.set_editor_property("end_node_id", unreal.Name(end_node))
    actor.set_editor_property("speed_limit_kmh", float(speed))
    actor.set_editor_property("stop_line_distance_m", float(stop_distance))
    actor.set_lane_tags(bool(spawn), False, False, bool(safe_uturn))
    spline = actor.get_component_by_class(unreal.SplineComponent)
    spline.clear_spline_points(False)
    for index, point in enumerate(points):
        spline.add_spline_point(vector(*point), unreal.SplineCoordinateSpace.WORLD, False)
        spline.set_spline_point_type(index, unreal.SplinePointType.LINEAR, False)
    spline.update_spline()
    return actor


skipped_buildings = []


def building_overlaps_road(cx, cy, width, depth):
    min_x, max_x = cx - width / 2.0, cx + width / 2.0
    min_y, max_y = cy - depth / 2.0, cy + depth / 2.0
    # Include asphalt, sidewalks, curbs, and a small placement buffer.
    for road_y in horizontal_roads:
        road_half_width = (3400 if road_y == 30000 else 1800) / 2.0 + 650
        if max_y > road_y - road_half_width and min_y < road_y + road_half_width:
            return True
    for road_x in vertical_roads:
        road_half_width = 1800 / 2.0 + 650
        within_road_length = max_y > -40000 and min_y < 40000
        if within_road_length and max_x > road_x - road_half_width and min_x < road_x + road_half_width:
            return True
    return False


def add_building(layers, cx, cy, width, depth, height, facade, style="midrise", floors=0):
    if building_overlaps_road(cx, cy, width, depth):
        skipped_buildings.append((cx, cy, width, depth))
        return False
    body = layers[facade]
    box(body, cx, cy, height / 2.0, width, depth, height)
    roof = layers["Roof"]
    box(roof, cx, cy, height + 5, width + 60, depth + 60, 35)

    if style in ("midrise", "tower", "store"):
        box(layers["Storefront"], cx, cy - depth / 2.0 - 22, 150, width * 0.78, 44, 235)
        box(layers["Storefront"], cx, cy + depth / 2.0 + 22, 150, width * 0.78, 44, 235)

    story_height = 320 if style in ("row", "house") else (390 if style == "tower" else 330)
    rows = max(2, min(48, floors if floors else int((height - 300) / story_height)))
    margin = max(100.0, min(500.0, width * 0.08))
    spacing_x = max(500.0, (width - margin * 2) / max(2, int((width - margin * 2) / (850 if style == "tower" else 1050))))
    columns_x = max(2, int((width - margin * 2) / spacing_x))
    spacing_y = max(500.0, (depth - margin * 2) / max(2, int((depth - margin * 2) / 1000)))
    columns_y = max(2, int((depth - margin * 2) / spacing_y))
    win_w = min(430.0, spacing_x * 0.62)
    win_d = min(430.0, spacing_y * 0.62)
    win_h = min(190.0, story_height * 0.52)
    floor_step = height / (rows + 1)

    for row in range(rows):
        z = 260.0 + (row + 0.55) * floor_step
        if z > height - 110:
            continue
        for col in range(columns_x):
            x = cx - width / 2 + margin + (col + 0.5) * (width - margin * 2) / columns_x
            box(layers["Windows"], x, cy - depth / 2 - 18, z, win_w, 36, win_h)
            box(layers["Windows"], x, cy + depth / 2 + 18, z, win_w, 36, win_h)
        if style not in ("row", "house"):
            for col in range(columns_y):
                y = cy - depth / 2 + margin + (col + 0.5) * (depth - margin * 2) / columns_y
                box(layers["Windows"], cx - width / 2 - 18, y, z, 36, win_d, win_h)
                box(layers["Windows"], cx + width / 2 + 18, y, z, 36, win_d, win_h)

    if style == "tower":
        for row in range(1, rows + 1):
            z = min(height - 80, row * floor_step)
            box(layers["Trim"], cx, cy - depth / 2 - 25, z, width, 50, 28)
            box(layers["Trim"], cx, cy + depth / 2 + 25, z, width, 50, 28)
    elif style in ("row", "house"):
        # A projecting sill and a compact entry canopy make the repeated homes read as individual lots.
        box(layers["Trim"], cx, cy - depth / 2 - 95, 275, width * 0.62, 140, 28)
        box(layers["Trim"], cx, cy - depth / 2 - 65, height * 0.78, width * 0.42, 24, 28)


def add_tree(layers, x, y, height=800, crown=500):
    trunk_height = height * 0.70
    box(layers["Bark"], x, y, trunk_height / 2.0, 62, 62, trunk_height)
    branch_length = crown * 0.55
    for dx, dy, yaw in ((1, 0, 0), (0, 1, 90), (-1, 0, 180), (0, -1, 270)):
        layers["Branches"].add_world_instance(
            vector(x + dx * branch_length * 0.12, y + dy * branch_length * 0.12, height * 0.62),
            unreal.Rotator(50, yaw, 0), vector(0.34, 0.34, branch_length / 100.0))

    canopy_z = height * 0.80
    layers["Leaves"].add_world_instance(
        vector(x, y, canopy_z), unreal.Rotator(0, 0, 0),
        vector(crown * 1.22 / 100.0, crown * 1.08 / 100.0, crown * 0.94 / 100.0))
    clusters = (
        (-0.20, -0.10, 0.02, 0.68, "LeavesLight"),
        (0.18, -0.14, 0.01, 0.70, "Leaves"),
        (-0.12, 0.19, 0.04, 0.72, "LeavesShadow"),
        (0.20, 0.15, -0.04, 0.67, "LeavesLight"),
        (-0.02, -0.22, -0.08, 0.65, "Leaves"),
        (0.03, 0.04, 0.17, 0.66, "LeavesLight"),
        (-0.18, 0.14, -0.09, 0.62, "LeavesShadow"),
    )
    for offset_x, offset_y, offset_z, size, layer in clusters:
        diameter = crown * size
        layers[layer].add_world_instance(
            vector(x + offset_x * crown, y + offset_y * crown, canopy_z + offset_z * crown),
            unreal.Rotator(0, 0, 0),
            vector(diameter / 100.0, diameter * 0.92 / 100.0, diameter * 0.88 / 100.0))


surface_enum = next((getattr(unreal, item) for item in ("SurfaceType", "PhysicalSurface", "EPhysicalSurface")
                     if hasattr(unreal, item)), None)
if surface_enum:
    surface_values = sorted([getattr(surface_enum, key) for key in dir(surface_enum)
                             if key.upper().endswith(("TYPE1", "TYPE2", "TYPE3"))], key=str)[:3]
else:
    surface_values = [1, 2, 3]
if len(surface_values) < 3:
    surface_values = [1, 2, 3]

if not unreal.EditorAssetLibrary.does_directory_exist(MATERIAL_ROOT):
    unreal.EditorAssetLibrary.make_directory(MATERIAL_ROOT)
if not unreal.EditorAssetLibrary.does_directory_exist(PHYSICAL_ROOT):
    unreal.EditorAssetLibrary.make_directory(PHYSICAL_ROOT)

materials = {
    "Ground": make_material("M_P3GrassGround", (0.16, 0.25, 0.12), 0.96),
    "Asphalt": make_material("M_P3Asphalt", (0.13, 0.145, 0.16), 0.93),
    "Gravel": make_material("M_P3Gravel", (0.30, 0.25, 0.16), 0.98),
    "Concrete": make_material("M_P3SidewalkConcrete", (0.38, 0.39, 0.38), 0.90),
    "Markings": make_material("M_P3RoadMarking", (0.82, 0.77, 0.60), 0.74),
    "BrickRed": make_material("M_P3BrickRed", (0.34, 0.105, 0.075), 0.88),
    "BrickBrown": make_material("M_P3BrickBrown", (0.27, 0.17, 0.12), 0.9),
    "Stone": make_material("M_P3StoneFacade", (0.56, 0.52, 0.44), 0.86),
    "ConcreteBuilding": make_material("M_P3BuildingConcrete", (0.43, 0.47, 0.49), 0.75),
    "GlassBuilding": make_material("M_P3BlueGlassFacade", (0.16, 0.26, 0.32), 0.32, 0.32),
    "Windows": make_material("M_P3WindowGlass", (0.045, 0.10, 0.15), 0.22, 0.28),
    "Storefront": make_material("M_P3StorefrontGlass", (0.075, 0.18, 0.20), 0.28, 0.16),
    "Roof": make_material("M_P3Roof", (0.20, 0.20, 0.19), 0.92),
    "Trim": make_material("M_P3FacadeTrim", (0.68, 0.62, 0.48), 0.84),
    "Industrial": make_material("M_P3IndustrialMetal", (0.30, 0.34, 0.35), 0.65, 0.25),
    "Bark": make_material("M_P3TreeBark", (0.20, 0.11, 0.06), 0.96),
    "Leaves": make_material("M_P3TreeLeaves", (0.075, 0.22, 0.075), 0.9),
    "LeavesLight": make_material("M_P3TreeLeavesLight", (0.10, 0.245, 0.075), 0.94),
    "LeavesShadow": make_material("M_P3TreeLeavesShadow", (0.06, 0.18, 0.06), 0.96),
    "Lamp": make_material("M_P3StreetFixture", (0.12, 0.13, 0.12), 0.68, 0.3),
    "SignalRed": make_material("M_P3SignalRed", (0.72, 0.025, 0.012), 0.32, 0.08),
    "SignalYellow": make_material("M_P3SignalYellow", (0.92, 0.43, 0.025), 0.32, 0.08),
    "SignalGreen": make_material("M_P3SignalGreen", (0.025, 0.58, 0.12), 0.32, 0.08),
    "HighwayBlue": make_material("M_OWDHighwaySignBlue", (0.025, 0.105, 0.23), 0.42, 0.16),
    "RacingAccent": make_material("M_OWDRacingAccent", (0.82, 0.20, 0.035), 0.46, 0.12),
}
physical = {
    "Ground": make_physical("Grass", 0.42, surface_values[2]),
    "Asphalt": make_physical("Asphalt", 1.0, surface_values[0]),
    "Gravel": make_physical("Gravel", 0.62, surface_values[1]),
}

if unreal.EditorAssetLibrary.does_asset_exist(MAP_PATH):
    if not unreal.EditorLevelLibrary.load_level(MAP_PATH):
        raise RuntimeError("Could not load existing open driving map")
    for actor in unreal.EditorLevelLibrary.get_all_level_actors():
        if actor.get_actor_label().startswith("P3_"):
            unreal.EditorLevelLibrary.destroy_actor(actor)
else:
    if not unreal.EditorLevelLibrary.new_level(MAP_PATH):
        raise RuntimeError("Could not create open driving map")

cube = unreal.load_asset("/Engine/BasicShapes/Cube.Cube")
sphere = unreal.load_asset("/Engine/BasicShapes/Sphere.Sphere")
cylinder = unreal.load_asset("/Engine/BasicShapes/Cylinder.Cylinder")
plane = unreal.load_asset("/Engine/BasicShapes/Plane.Plane")
layers = {
    "Ground": spawn_layer("Ground", cube, materials["Ground"], physical["Ground"], True),
    "Asphalt": spawn_layer("Road_Asphalt", cube, materials["Asphalt"], physical["Asphalt"], True),
    "Gravel": spawn_layer("Road_Gravel", cube, materials["Gravel"], physical["Gravel"], True),
    "Concrete": spawn_layer("Concrete_Structures", cube, materials["Concrete"], physical["Asphalt"], True),
    "Sidewalk": spawn_layer("Raised_Sidewalks_Curbs", cube, materials["Concrete"], None, False),
    "Markings": spawn_layer("Road_Markings", plane, materials["Markings"], None, False),
    "BrickRed": spawn_layer("Facade_Brick_Red", cube, materials["BrickRed"], None, True),
    "BrickBrown": spawn_layer("Facade_Brick_Brown", cube, materials["BrickBrown"], None, True),
    "Stone": spawn_layer("Facade_Stone", cube, materials["Stone"], None, True),
    "ConcreteBuilding": spawn_layer("Facade_Concrete", cube, materials["ConcreteBuilding"], None, True),
    "GlassBuilding": spawn_layer("Facade_Glass", cube, materials["GlassBuilding"], None, True),
    "Windows": spawn_layer("Windows", cube, materials["Windows"], None, False),
    "Storefront": spawn_layer("Storefronts", cube, materials["Storefront"], None, False),
    "Roof": spawn_layer("Roofs", cube, materials["Roof"], None, True),
    "Trim": spawn_layer("Facade_Details", cube, materials["Trim"], None, False),
    "Industrial": spawn_layer("Industrial_Sheds", cube, materials["Industrial"], None, True),
    "Bark": spawn_layer("Trees_Trunks", cylinder, materials["Bark"], None, True),
    "Branches": spawn_layer("Trees_Branches", cylinder, materials["Bark"], None, False),
    "Leaves": spawn_layer("Trees_Crowns", sphere, materials["Leaves"], None, False),
    "LeavesLight": spawn_layer("Trees_Canopy_Light", sphere, materials["LeavesLight"], None, False),
    "LeavesShadow": spawn_layer("Trees_Canopy_Shadow", sphere, materials["LeavesShadow"], None, False),
    "Lamp": spawn_layer("Street_Furniture", cube, materials["Lamp"], None, False),
    "SignalRed": spawn_layer("Signal_Lenses_Red", sphere, materials["SignalRed"], None, False),
    "SignalYellow": spawn_layer("Signal_Lenses_Yellow", sphere, materials["SignalYellow"], None, False),
    "SignalGreen": spawn_layer("Signal_Lenses_Green", sphere, materials["SignalGreen"], None, False),
    "HighwaySigns": spawn_layer("Highway_Signs", cube, materials["HighwayBlue"], None, False),
    "RaceAccents": spawn_layer("Racing_Hub_Accents", cube, materials["RacingAccent"], None, False),
}

# 1.1 km x 1.0 km playable ground. Its top is Z=0 so vegetation, buildings,
# and street fixtures meet the same grade as the sidewalk apron.
box(layers["Ground"], 0, 0, -50, 120000, 110000, 100)
horizontal_roads = [-30000, 0, 30000]
vertical_roads = [-25000, 25000]
x_nodes = [-50000, -25000, 25000, 50000]
y_nodes = [-40000, -30000, 0, 30000, 40000]
for y in horizontal_roads:
    width = 3400 if y == 30000 else 1800
    box(layers["Asphalt"], 0, y, ROAD_Z, 100000, width, 45)
    for side in (-1, 1):
        sidewalk_y = y + side * (width / 2 + 150)
        curb_y = y + side * (width / 2 + 370)
        for start_x, end_x in split_intervals(-50000, 50000, [(cross_x, 1150) for cross_x in vertical_roads]):
            box(layers["Sidewalk"], (start_x + end_x) / 2, sidewalk_y, -5,
                end_x - start_x, 300, 38)
            box(layers["Sidewalk"], (start_x + end_x) / 2, curb_y, -5,
                end_x - start_x, 140, 44)
    # Dashed lane dividers plus the double center line and edge lines.
    if y == 30000:
        for lane_y in (-1000, -500, 500, 1000):
            for x in range(-48500, 48501, 2600):
                box(layers["Markings"], x, y + lane_y, 5, 950, 18, 1)
        for lane_y in (-90, 90):
            box(layers["Markings"], 0, y + lane_y, 5, 100000, 18, 1)
    else:
        for lane_y in (-650, -350, -18, 18, 350, 650):
            if abs(lane_y) < 30:
                box(layers["Markings"], 0, y + lane_y, 5, 100000, 18, 1)
            else:
                for x in range(-48500, 48501, 2600):
                    box(layers["Markings"], x, y + lane_y, 5, 950, 18, 1)
    for edge_y in (-width / 2 + 100, width / 2 - 100):
        box(layers["Markings"], 0, y + edge_y, 5, 100000, 16, 1)

# Sign gantries and repeated lamp posts make the high-speed boulevard read as an express route.
for gantry_x in (-36000, 36000):
    for side in (-1, 1):
        box(layers["Lamp"], gantry_x, 30000 + side * 1880, 320, 150, 150, 640)
    box(layers["Lamp"], gantry_x, 30000, 640, 3960, 150, 150)
    for panel_y in (-1180, -590, 0, 590, 1180):
        box(layers["HighwaySigns"], gantry_x, 30000 + panel_y, 510, 520, 500, 35)
        box(layers["Markings"], gantry_x, 30000 + panel_y, 531, 240, 20, 2)
        box(layers["Markings"], gantry_x + 90, 30000 + panel_y, 532, 18, 100, 2)

for x in range(-46000, 46001, 8000):
    for side in (-1, 1):
        light_y = 30000 + side * 2050
        box(layers["Lamp"], x, light_y, 300, 42, 42, 600)
        box(layers["Lamp"], x + 170, light_y - side * 120, 585, 350, 32, 32)
        layers["SignalYellow"].add_world_instance(
            vector(x + 335, light_y - side * 120, 565), unreal.Rotator(0, 0, 0), vector(0.16, 0.16, 0.16))

for x in vertical_roads:
    box(layers["Asphalt"], x, 0, ROAD_Z, 1800, 80000, 45)
    for side in (-1, 1):
        sidewalk_x = x + side * 1050
        curb_x = x + side * 1270
        intersection_cuts = [(cross_y, (2300 if cross_y == 30000 else 1800) / 2 + 250)
                             for cross_y in horizontal_roads]
        for start_y, end_y in split_intervals(-40000, 40000, intersection_cuts):
            box(layers["Sidewalk"], sidewalk_x, (start_y + end_y) / 2, -5,
                300, end_y - start_y, 38)
            box(layers["Sidewalk"], curb_x, (start_y + end_y) / 2, -5,
                140, end_y - start_y, 44)
    for lane_x in (-650, -350, -18, 18, 350, 650):
        if abs(lane_x) < 30:
            box(layers["Markings"], x + lane_x, 0, 5, 18, 80000, 1)
        else:
            for y in range(-38500, 38501, 2600):
                box(layers["Markings"], x + lane_x, y, 5, 18, 950, 1)
    for edge_x in (-820, 820):
        box(layers["Markings"], x + edge_x, 0, 5, 16, 80000, 1)

# Crosswalks and stop bars at each signalized intersection.
for x in vertical_roads:
    for y in horizontal_roads:
        for side in (-1, 1):
            stripe_count = 18 if y == 30000 else 8
            stripe_start = -1650 if y == 30000 else -690
            stripe_offset = 195
            stripe_y = 1850 if y == 30000 else 1210
            for stripe in range(stripe_count):
                box(layers["Markings"], x + stripe_start + stripe * stripe_offset, y + side * stripe_y, 5, 105, 630, 1)
        for side in (-1, 1):
            for stripe in range(8):
                box(layers["Markings"], x + side * 1210, y - 690 + stripe * 195, 5, 630, 105, 1)
        for side in (-1, 1):
            box(layers["Markings"], x + side * 1000, y, 5, 44, 1600, 1)
            box(layers["Markings"], x, y + side * 1000, 5, 1600, 44, 1)

# A player-facing garage and open car-meet plaza anchor the city hub.
box(layers["Asphalt"], -8500, -7900, ROAD_Z, 17500, 9000, 45)
box(layers["Asphalt"], -8500, -3900, ROAD_Z, 1800, 8000, 45)
box(layers["Concrete"], -13500, -7900, 160, 6200, 6700, 320)
box(layers["GlassBuilding"], -13500, -7900, 390, 5750, 6250, 140)
box(layers["Roof"], -13500, -7900, 335, 6500, 7000, 90)
box(layers["Storefront"], -10300, -11330, 155, 4700, 55, 255)
box(layers["Trim"], -10300, -11370, 155, 1500, 70, 280)
for x in (-15800, -11200, -6600):
    box(layers["Trim"], x, -11420, 150, 110, 85, 300)
box(layers["RaceAccents"], -8500, -4500, 35, 17000, 180, 14)
for x in range(-16500, 1501, 2400):
    for y in (-11100, -5600):
        box(layers["Markings"], x, y, 6, 850, 18, 1)
for x in range(-15000, 1, 5000):
    box(layers["Lamp"], x, -4000, 270, 50, 50, 540)
    box(layers["Lamp"], x + 180, -4120, 535, 360, 28, 28)

# Connected side boulevard, two-lane drag strip, and spectator paddock.
box(layers["Asphalt"], 38750, -15000, ROAD_Z, 27500, 1500, 45)
box(layers["Asphalt"], 38200, -18200, ROAD_Z, 15000, 4200, 45)
for x in range(26000, 52001, 2600):
    box(layers["Markings"], x, -15000, 6, 850, 18, 1)
box(layers["Markings"], 38750, -15000, 6, 27500, 18, 1)
box(layers["Markings"], 25700, -15000, 6, 55, 1500, 1)
box(layers["Markings"], 27000, -15000, 6, 180, 1500, 1)
for x in range(31500, 45501, 600):
    box(layers["Markings"], x, -18200, 6, 22, 900, 1)
for x in range(31500, 46500, 2500):
    box(layers["Concrete"], x, -20550, -4, 2500, 90, 24)
box(layers["RaceAccents"], 38200, -16000, 40, 14800, 130, 18)

# Street trees and basic Toronto-style mid-rise/rowhouse blocks.
for y in horizontal_roads:
    for x in range(-47000, 47001, 4200):
        add_tree(layers, x, y - 1570, random.randint(620, 850), random.randint(390, 510))
        add_tree(layers, x, y + 1570, random.randint(620, 850), random.randint(390, 510))
for x in vertical_roads:
    for y in range(-37000, 37001, 5000):
        add_tree(layers, x + 1570, y, random.randint(620, 840), 440)

# Northwest and southeast residential districts: attached masonry homes with repeated sash windows.
for y_base in (-27000, 3000):
    for row in range(2):
        house_y = y_base + row * 21000 + (6500 if row == 0 else 2500)
        for i in range(15):
            house_x = -48500 + i * 1450
            add_building(layers, house_x, house_y, 1250, 1150, random.choice((1050, 1180, 1300)),
                         random.choice(("BrickRed", "BrickBrown", "Stone")), "row", 3)

for y_base in (-27000, 3000):
    for row in range(2):
        house_y = y_base + row * 20500 + (5800 if row == 0 else 2200)
        for i in range(13):
            house_x = 28500 + i * 1550
            add_building(layers, house_x, house_y, 1300, 1200, random.choice((980, 1120, 1260)),
                         random.choice(("BrickBrown", "Stone", "BrickRed")), "house", 3)

# Annex-like urban houses and small apartment walk-ups on the west-side blocks.
for block_x in (-46500, -31500):
    for block_y in (-16000, 15000):
        for row in range(2):
            for i in range(4):
                add_building(layers, block_x + i * 3200, block_y + row * 7300, 2450, 1800,
                             random.choice((1700, 2050, 2450)), random.choice(("BrickRed", "BrickBrown", "Stone")), "store", 5)

# Downtown mixed-use towers, podiums, and 6- to 10-storey apartment blocks.
for cx, cy, width, depth, height, facade in (
    (-15000, -18000, 6200, 5600, 14200, "GlassBuilding"),
    (0, -18000, 7000, 6100, 18500, "GlassBuilding"),
    (15000, -18000, 5900, 5600, 11900, "ConcreteBuilding"),
    (-14500, 16000, 6800, 5800, 16500, "GlassBuilding"),
    (1000, 16000, 7600, 6400, 22000, "GlassBuilding"),
    (16500, 15000, 6300, 5500, 13200, "ConcreteBuilding"),
):
    add_building(layers, cx, cy, width, depth, height, facade, "tower")

for cx, cy, facade in ((8000, -5000, "Stone"),
                       (-8000, 5000, "BrickRed"), (9000, 5000, "ConcreteBuilding"),
                       (-17000, 6000, "Stone"), (17500, -5000, "BrickBrown")):
    add_building(layers, cx, cy, 5200, 4100, random.choice((5400, 6200, 7200)), facade, "midrise", 8)

# East-end industrial sheds with loading bays and the test parking lot.
for cx, cy in ((36500, -24000), (43000, -23500), (36000, 19000), (43000, 20500), (36500, 41000)):
    box(layers["Industrial"], cx, cy, 1650, 6300, 7600, 3300)
    box(layers["Roof"], cx, cy, 3320, 6500, 7800, 50)
    for dock in range(4):
        box(layers["Storefront"], cx - 2250 + dock * 1500, cy - 3810, 700, 950, 45, 1150)
        box(layers["Trim"], cx - 2250 + dock * 1500, cy - 3860, 1310, 1100, 100, 90)

# One short covered cut-and-cover tunnel through the southeast industrial block.
box(layers["Concrete"], 38200, -30000, 340, 17500, 2100, 680)
box(layers["Concrete"], 38200, -31050, 150, 17500, 90, 340)
box(layers["Concrete"], 38200, -28950, 150, 17500, 90, 340)
for x in range(30200, 47001, 2400):
    box(layers["Lamp"], x, -30000, 620, 60, 60, 38)
    layers["Lamp"].add_world_instance(vector(x, -30000, 655), unreal.Rotator(0, 0, 0), vector(0.13, 0.13, 0.13))

# Visible perimeter edge treatment; the grass base and tree line prevent the driving map ending in a void.
for x in range(-54000, 54001, 2600):
    add_tree(layers, x, -48200, 900, 540)
    add_tree(layers, x, 48200, 900, 540)
for y in range(-47000, 47001, 2600):
    add_tree(layers, -53200, y, 900, 540)
    add_tree(layers, 53200, y, 900, 540)
for x in (-54500, 54500):
    box(layers["Concrete"], x, 0, 70, 120, 100000, 140)
for y in (-49500, 49500):
    box(layers["Concrete"], 0, y, 70, 110000, 120, 140)

# Build a directed lane graph. Each approach can continue straight or turn into any lane leaving that junction.
lane_specs = []
segment_lanes = {}
outgoing_by_node = {}

def register_lane(lane_id, start_node, end_node, points, speed, stop_distance, spawn, group_key):
    spec = {"id": lane_id, "start": start_node, "end": end_node, "points": points, "speed": speed,
            "stop": stop_distance, "spawn": spawn, "group": group_key, "next": [], "adjacent": []}
    lane_specs.append(spec)
    outgoing_by_node.setdefault(start_node, []).append(spec)
    segment_lanes.setdefault(group_key, []).append(spec)

for y in horizontal_roads:
    for seg_index in range(len(x_nodes) - 1):
        x1, x2 = x_nodes[seg_index], x_nodes[seg_index + 1]
        left_node, right_node = node_id(x1, y), node_id(x2, y)
        lane_len = (x2 - x1) / 100.0
        speed = 100.0 if y == 30000 else 50.0
        lane_offsets = (("E", (-250, -750, -1250), left_node, right_node, x1, x2),
                        ("W", (250, 750, 1250), right_node, left_node, x2, x1)) if y == 30000 else (
                        ("E", (-175, -525), left_node, right_node, x1, x2),
                        ("W", (175, 525), right_node, left_node, x2, x1))
        for direction, lanes, start, end, start_x, end_x in lane_offsets:
            for lane_index, offset in enumerate(lanes):
                lane_id = "H_{}_{}_{}_L{}".format(name_token(y), seg_index, direction, lane_index)
                line_y = y + offset
                points = [(start_x, line_y, ROAD_Z + 40), (end_x, line_y, ROAD_Z + 40)]
                register_lane(lane_id, start, end, points, speed,
                              20.0 if end in {node_id(x, y) for x in vertical_roads} else 0.0,
                              (seg_index == 0 and direction == "E" and lane_index == 0),
                              ("H", y, seg_index, direction))

for x in vertical_roads:
    for seg_index in range(len(y_nodes) - 1):
        y1, y2 = y_nodes[seg_index], y_nodes[seg_index + 1]
        south_node, north_node = node_id(x, y1), node_id(x, y2)
        speed = 40.0
        for direction, lanes, start, end, start_y, end_y in (
            ("N", (175, 525), south_node, north_node, y1, y2),
            ("S", (-175, -525), north_node, south_node, y2, y1),
        ):
            for lane_index, offset in enumerate(lanes):
                lane_id = "V_{}_{}_{}_L{}".format(name_token(x), seg_index, direction, lane_index)
                line_x = x + offset
                points = [(line_x, start_y, ROAD_Z + 40), (line_x, end_y, ROAD_Z + 40)]
                register_lane(lane_id, start, end, points, speed,
                              20.0 if end in {node_id(x, y) for y in horizontal_roads} else 0.0,
                              (seg_index == 0 and direction == "N" and lane_index == 0),
                              ("V", x, seg_index, direction))

for spec in lane_specs:
    spec["next"] = [other["id"] for other in outgoing_by_node.get(spec["end"], [])]
    if not spec["next"]:
        spec["next"] = [spec["id"]]
        spec["safe"] = True
    else:
        spec["safe"] = False
for group_specs in segment_lanes.values():
    for lane in group_specs:
        lane["adjacent"] = [other["id"] for other in group_specs
                             if other["id"] != lane["id"] and other["group"][3] == lane["group"][3]]

for spec in lane_specs:
    actor = create_lane(spec["id"], spec["start"], spec["end"], spec["points"], spec["speed"],
                        spec["stop"], spec["spawn"], spec.get("safe", False))
    actor.set_editor_property("NextLaneIDs", [unreal.Name(item) for item in spec["next"]])
    actor.set_editor_property("AdjacentLaneIDs", [unreal.Name(item) for item in spec["adjacent"]])

signal_count = 0
for x in vertical_roads:
    for y in horizontal_roads:
        intersection_node = node_id(x, y)
        east_west_ids = [spec["id"] for spec in lane_specs if spec["end"] == intersection_node and spec["group"][0] == "H"]
        north_south_ids = [spec["id"] for spec in lane_specs if spec["end"] == intersection_node and spec["group"][0] == "V"]
        signal = unreal.EditorLevelLibrary.spawn_actor_from_class(
            unreal.TrafficSignalController, vector(x, y, 0), unreal.Rotator(0, 0, 0))
        signal.set_actor_label("P3_Signal_" + name_token(x) + "_" + name_token(y))
        signal.set_editor_property("signal_id", unreal.Name("Signal_" + name_token(x) + "_" + name_token(y)))
        signal.set_editor_property("intersection_node_id", unreal.Name(intersection_node))
        signal.set_editor_property("EastWestLaneIDs", [unreal.Name(item) for item in east_west_ids])
        signal.set_editor_property("NorthSouthLaneIDs", [unreal.Name(item) for item in north_south_ids])
        signal_count += 1

        # Grounded pedestrian-scale poles with three vertically stacked signal aspects.
        for sx in (-1, 1):
            for sy in (-1, 1):
                px, py = x + sx * 1200, y + sy * 1200
                box(layers["Lamp"], px, py, 290, 48, 48, 580)
                head_x, head_y = px - sx * 24, py - sy * 24
                box(layers["Lamp"], head_x, head_y, 710, 112, 104, 300)
                for lens_z, color_layer in ((790, "SignalRed"), (710, "SignalYellow"), (630, "SignalGreen")):
                    layers[color_layer].add_world_instance(
                        vector(head_x - sx * 76, head_y - sy * 76, lens_z),
                        unreal.Rotator(0, 0, 0), vector(0.48, 0.48, 0.48))


start = unreal.EditorLevelLibrary.spawn_actor_from_class(
    unreal.PlayerStart, vector(0, -700, 180), unreal.Rotator(0, 0, 0))
start.set_actor_label("P3_PlayerStart_MotorHub")

sun = unreal.EditorLevelLibrary.spawn_actor_from_class(
    unreal.DirectionalLight, vector(0, 0, 12000), unreal.Rotator(-38, -30, 0))
sun.set_actor_label("P3_DaylightSun")
sun_component = sun.get_component_by_class(unreal.DirectionalLightComponent)
sun_component.set_editor_property("mobility", unreal.ComponentMobility.MOVABLE)
sun_component.set_editor_property("intensity", 5.5)
sun_component.set_editor_property("atmosphere_sun_light", True)
atmosphere = unreal.EditorLevelLibrary.spawn_actor_from_class(unreal.SkyAtmosphere, vector(0, 0, 0))
atmosphere.set_actor_label("P3_BlueSkyAtmosphere")
sky = unreal.EditorLevelLibrary.spawn_actor_from_class(unreal.SkyLight, vector(0, 0, 5000))
sky.set_actor_label("P3_DaylightSkylight")
sky_component = sky.get_component_by_class(unreal.SkyLightComponent)
sky_component.set_editor_property("mobility", unreal.ComponentMobility.MOVABLE)
sky_component.set_editor_property("real_time_capture", True)
fog = unreal.EditorLevelLibrary.spawn_actor_from_class(unreal.ExponentialHeightFog, vector(0, 0, 0))
fog.set_actor_label("P3_LightAtmosphericHaze")
fog_component = fog.get_component_by_class(unreal.ExponentialHeightFogComponent)
fog_component.set_editor_property("fog_density", 0.004)
fog_component.set_editor_property("fog_height_falloff", 0.25)

if not unreal.EditorLevelLibrary.save_current_level():
    raise RuntimeError("Could not save open driving map")
unreal.log("Open driving map generated: city hub + 6-lane express route + drag strip; lanes={} signals={} windows={} buildings_skipped_for_road_clearance={}".format(
    len(lane_specs), signal_count, layers["Windows"].get_component_by_class(unreal.HierarchicalInstancedStaticMeshComponent).get_instance_count(), len(skipped_buildings)))
