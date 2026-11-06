"""Create the first drivable city layout in a separate Unreal level."""
import math

import unreal


MAP_PATH = "/Game/RacingMVP/Maps/L_CityShell"
MATERIALS = "/Game/RacingMVP/World/Materials/"
PHYSICS = "/Game/RacingMVP/World/Physics/"


def vector(x, y, z):
    return unreal.Vector(float(x), float(y), float(z))


def layer(name, mesh, material, physical=None, collision=False):
    actor = unreal.EditorLevelLibrary.spawn_actor_from_class(
        unreal.P3CityInstanceLayer, vector(0, 0, 0), unreal.Rotator(0, 0, 0))
    actor.set_actor_label("Shell_" + name)
    actor.configure_layer(mesh, material, physical, collision)
    return actor


def block(target, x, y, z, width, depth, height, yaw=0, pitch=0):
    target.add_world_instance(
        vector(x, y, z), unreal.Rotator(pitch, yaw, 0),
        vector(width / 100, depth / 100, height / 100))


def point_on_curve(points, index, t):
    p0 = points[max(0, index - 1)]
    p1 = points[index]
    p2 = points[index + 1]
    p3 = points[min(len(points) - 1, index + 2)]
    result = []
    for axis in range(2):
        a, b, c, d = p0[axis], p1[axis], p2[axis], p3[axis]
        result.append(0.5 * ((2 * b) + (-a + c) * t
                             + (2 * a - 5 * b + 4 * c - d) * t * t
                             + (-a + 3 * b - 3 * c + d) * t * t * t))
    return tuple(result)


road_samples = []


def road(points, width, paint=True):
    samples = [points[0]]
    for index in range(len(points) - 1):
        distance = math.dist(points[index], points[index + 1])
        steps = max(2, math.ceil(distance / 700))
        samples.extend(point_on_curve(points, index, step / steps)
                       for step in range(1, steps + 1))
    road_samples.extend((x, y, width / 2) for x, y in samples)
    for index, ((x1, y1), (x2, y2)) in enumerate(zip(samples, samples[1:])):
        length = math.hypot(x2 - x1, y2 - y1)
        if length < 1:
            continue
        yaw = math.degrees(math.atan2(y2 - y1, x2 - x1))
        x, y = (x1 + x2) / 2, (y1 + y2) / 2
        block(asphalt, x, y, -20, length + 100, width, 40, yaw)
        if paint and index % 3 == 1:
            block(markings, x, y, 4, min(length * 0.7, 400), 16, 1, yaw)


def bridge_height(x):
    if x < 6000:
        t = (x + 3000) / 9000
    elif x > 14000:
        t = (23000 - x) / 9000
    else:
        return 260
    t = max(0, min(1, t))
    return 260 * (3 * t * t - 2 * t * t * t)


def clear_of_roads(x, y, width, depth):
    radius = math.hypot(width, depth) / 2 + 350
    return all(math.hypot(x - rx, y - ry) > radius + half_width
               for rx, ry, half_width in road_samples)


if unreal.EditorAssetLibrary.does_asset_exist(MAP_PATH):
    unreal.EditorLevelLibrary.load_level(MAP_PATH)
    for actor in unreal.EditorLevelLibrary.get_all_level_actors():
        if actor.get_actor_label().startswith("Shell_"):
            unreal.EditorLevelLibrary.destroy_actor(actor)
else:
    unreal.EditorLevelLibrary.new_level(MAP_PATH)

cube = unreal.load_asset("/Engine/BasicShapes/Cube.Cube")
plane = unreal.load_asset("/Engine/BasicShapes/Plane.Plane")


def material(name):
    asset = unreal.load_asset(MATERIALS + name)
    if not asset:
        raise RuntimeError("Missing existing material " + name)
    return asset


ground = layer("Ground", cube, material("M_P3GrassGround"),
               unreal.load_asset(PHYSICS + "PM_P3Grass"), True)
asphalt = layer("Asphalt", cube, material("M_P3Asphalt"),
                unreal.load_asset(PHYSICS + "PM_P3Asphalt"), True)
markings = layer("Paint_NoCollision", plane, material("M_P3RoadMarking"))
water = layer("River_NoCollision", plane, material("M_P3BlueGlassFacade"))
bridge_edges = layer("Bridge_Rails_NoCollision", cube, material("M_P3SidewalkConcrete"))
towers = layer("Downtown_Massing", cube, material("M_P3BlueGlassFacade"))
apartments = layer("Residential_Massing", cube, material("M_P3BrickRed"))

# All street surfaces meet the same grade; paint and bridge rails have no collision.
block(ground, 0, 0, -55, 125000, 105000, 100)
block(water, 10000, 0, -3, 8500, 96000, 1)

# The bridge is the only river crossing in this first layout.
road([(-52000, -6000), (-3000, -6000)], 2200)
road([(23000, -6000), (54000, -6000)], 2200)
for x1 in range(-3000, 23000, 500):
    x2 = x1 + 500
    z1, z2 = bridge_height(x1), bridge_height(x2)
    pitch = math.degrees(math.atan2(z2 - z1, x2 - x1))
    block(asphalt, (x1 + x2) / 2, -6000, (z1 + z2) / 2 - 20,
          540, 2200, 40, pitch=pitch)
    if (x1 // 500) % 3 == 1:
        block(markings, (x1 + x2) / 2, -6000, (z1 + z2) / 2 + 4,
              300, 16, 1, pitch=pitch)
road_samples.extend((x, -6000, 1100) for x in range(-3000, 23001, 500))
for y in (-7100, -4900):
    block(bridge_edges, 10000, y, 315, 8400, 35, 80)

# Downtown's irregular loop and two diagonals connect back to the main route.
road([(-44000, -6000), (-47000, 3000), (-44500, 16000),
      (-34000, 28500), (-22000, 35000), (-9000, 28500),
      (-5500, 16500), (-12500, 4500), (-26000, -2500),
      (-44000, -6000)], 1700)
road([(-35000, -25000), (-32500, -6000), (-28500, 9500),
      (-22000, 35000)], 1400)
road([(-52000, -30000), (-35000, -25000), (-19000, -23000),
      (-8500, -16500), (-3000, -6000)], 1400)
road([(-38000, 26000), (-21000, 16000), (-7000, 16500)], 1100)

# The east side has a long residential loop and shorter connecting streets.
road([(23000, -6000), (27500, -23500), (44000, -30000),
      (55000, -18000), (51500, 8000), (39000, 25000),
      (22000, 31000), (18500, 14000), (23000, -6000)], 1700)
road([(23000, -6000), (31500, 1500), (39000, 25000)], 1300)
road([(27500, -23500), (33500, -9000), (51500, 8000)], 1100)
road([(18500, 14000), (30000, 13500), (39000, 25000)], 1100)

# Grounded volumes mark future districts without claiming to be finished art.
for x, y, width, depth, height in [
        (-38000, 11000, 3300, 3400, 6500), (-34000, 12000, 3000, 3200, 8200),
        (-24000, 5000, 3300, 3000, 10200), (-19500, 9000, 3000, 3300, 8700),
        (-17000, 21000, 3200, 3000, 7000), (-28000, 20500, 3600, 2900, 5700),
        (-12000, 11500, 2800, 3200, 5300), (-40500, -14500, 3500, 3000, 4400)]:
    if clear_of_roads(x, y, width, depth):
        block(towers, x, y, height / 2 - 5, width, depth, height)

for x, y in [(26000, 7000), (27500, 18000), (32500, 21000),
             (45000, 15000), (46500, 3000), (39000, -7000),
             (44000, -14000), (34500, -20000), (23500, -16000)]:
    if clear_of_roads(x, y, 3300, 1900):
        block(apartments, x, y, 850, 3300, 1900, 1710)

start = unreal.EditorLevelLibrary.spawn_actor_from_class(
    unreal.PlayerStart, vector(-9500, -6350, 180), unreal.Rotator(0, 0, 0))
start.set_actor_label("Shell_PlayerStart_BridgeApproach")

sun = unreal.EditorLevelLibrary.spawn_actor_from_class(
    unreal.DirectionalLight, vector(0, 0, 12000), unreal.Rotator(-38, -30, 0))
sun.set_actor_label("Shell_DaylightSun")
sun_component = sun.get_component_by_class(unreal.DirectionalLightComponent)
sun_component.set_editor_property("mobility", unreal.ComponentMobility.MOVABLE)
sun_component.set_editor_property("intensity", 5.5)
sun_component.set_editor_property("atmosphere_sun_light", True)
atmosphere = unreal.EditorLevelLibrary.spawn_actor_from_class(
    unreal.SkyAtmosphere, vector(0, 0, 0))
atmosphere.set_actor_label("Shell_BlueSky")
sky = unreal.EditorLevelLibrary.spawn_actor_from_class(
    unreal.SkyLight, vector(0, 0, 5000))
sky.set_actor_label("Shell_Skylight")
sky_component = sky.get_component_by_class(unreal.SkyLightComponent)
sky_component.set_editor_property("mobility", unreal.ComponentMobility.MOVABLE)
sky_component.set_editor_property("real_time_capture", True)
fog = unreal.EditorLevelLibrary.spawn_actor_from_class(
    unreal.ExponentialHeightFog, vector(0, 0, 0))
fog.set_actor_label("Shell_Haze")
fog.get_component_by_class(unreal.ExponentialHeightFogComponent).set_editor_property(
    "fog_density", 0.004)

if not unreal.EditorLevelLibrary.save_current_level():
    raise RuntimeError("Could not save city shell level")
unreal.log("City shell generated: curved street loops, one raised bridge, downtown and residential massing")
