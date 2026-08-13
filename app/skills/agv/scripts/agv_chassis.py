"""
AGV Chassis Parametric Template (CadQuery)
Generates a realistic AGV (Automated Guided Vehicle) chassis as a STEP solid.

Usage:
  python agv_chassis.py [--params JSON_FILE] [--output DIR]

Parameters (all in mm unless noted):
  chassis_length, chassis_width, plate_thickness
  rail_width, rail_height, rail_thickness
  cross_count, cross_width, cross_height
  wheel_radius, wheel_base, wheel_track, axle_diameter
  battery_length, battery_width, battery_height, battery_offset_x
  motor_mount_width, motor_mount_height, motor_bolt_diameter
  mount_hole_diameter, mount_hole_count_x, mount_hole_count_y
  plate_fillet
"""
import cadquery as cq
import json
import os
import sys
from pathlib import Path


def build_agv_chassis(
    chassis_length: float = 1200,
    chassis_width: float = 800,
    plate_thickness: float = 8,
    rail_width: float = 60,
    rail_height: float = 120,
    rail_thickness: float = 5,
    cross_count: int = 3,
    cross_width: float = 40,
    cross_height: float = 60,
    wheel_radius: float = 100,
    wheel_base: float = 900,
    wheel_track: float = 650,
    axle_diameter: float = 20,
    battery_length: float = 400,
    battery_width: float = 300,
    battery_height: float = 100,
    battery_offset_x: float = 0,
    motor_mount_width: float = 80,
    motor_mount_height: float = 60,
    motor_bolt_diameter: float = 8,
    mount_hole_diameter: float = 10,
    mount_hole_count_x: int = 6,
    mount_hole_count_y: int = 4,
    plate_fillet: float = 5,
) -> cq.Workplane:
    """Build a complete AGV chassis assembly as a CadQuery solid."""
    half_l = chassis_length / 2
    half_w = chassis_width / 2
    z_base = plate_thickness / 2

    # === 1. Base Plate ===
    base_plate = (
        cq.Workplane("XY")
        .box(chassis_length, chassis_width, plate_thickness)
        .edges("|Z").fillet(plate_fillet)
    )

    # Weight-reduction pockets
    margin = 50
    base_plate = (
        base_plate
        .faces(">Z").workplane()
        .rect(chassis_length - 2 * margin, chassis_width - 2 * margin)
        .cutBlind(-(plate_thickness - 3))
    )

    chassis = base_plate

    # === 2. Frame Rails (two longitudinal rectangular tubes) ===
    rail_len = chassis_length - 40
    y_offset = half_w - rail_width / 2 - 20

    for side in (-1, 1):
        y_pos = side * y_offset
        rail = cq.Workplane("XY").box(rail_len, rail_width, rail_height)
        inner = (
            cq.Workplane("XY")
            .box(rail_len - 2 * rail_thickness, rail_width - 2 * rail_thickness, rail_height - rail_thickness)
            .translate((0, 0, rail_thickness / 2))
        )
        rail_solid = rail.cut(inner).translate((0, y_pos, z_base + rail_height / 2))
        chassis = chassis.union(rail_solid)

    # === 3. Cross Members ===
    rail_inner = chassis_width - 2 * (rail_width + 20)
    cross_spacing = (chassis_length - 80) / max(cross_count, 1)

    for i in range(cross_count):
        x_pos = -half_l + 40 + cross_spacing * (i + 0.5)
        cross = (
            cq.Workplane("XY")
            .box(cross_width, rail_inner, cross_height)
            .translate((x_pos, 0, z_base + rail_height / 2))
        )
        chassis = chassis.union(cross)

    # === 4. Wheel Mounts (4 corners) ===
    wheel_positions = [
        (-wheel_base / 2, -wheel_track / 2),
        (-wheel_base / 2,  wheel_track / 2),
        ( wheel_base / 2, -wheel_track / 2),
        ( wheel_base / 2,  wheel_track / 2),
    ]

    for wx, wy in wheel_positions:
        mount = (
            cq.Workplane("XY")
            .box(motor_mount_width, motor_mount_width, motor_mount_height)
            .translate((wx, wy, z_base + motor_mount_height / 2))
        )
        # Axle hole
        axle_hole = (
            cq.Workplane("XY")
            .cylinder(motor_mount_height + 10, axle_diameter / 2)
            .translate((wx, wy, z_base + motor_mount_height / 2))
        )
        mount = mount.cut(axle_hole)

        # 4 bolt holes
        bolt_pcd = motor_mount_width * 0.6
        for bx, by in [(1, 1), (1, -1), (-1, 1), (-1, -1)]:
            bolt = (
                cq.Workplane("XY")
                .cylinder(motor_mount_height + 10, motor_bolt_diameter / 2)
                .translate((wx + bx * bolt_pcd / 2, wy + by * bolt_pcd / 2, z_base + motor_mount_height / 2))
            )
            mount = mount.cut(bolt)

        chassis = chassis.union(mount)

    # === 5. Battery Compartment ===
    bx = battery_offset_x
    by = 0
    bz = z_base + battery_height / 2
    wall = 4

    batt_outer = cq.Workplane("XY").box(battery_length, battery_width, battery_height)
    batt_inner = (
        cq.Workplane("XY")
        .box(battery_length - 2 * wall, battery_width - 2 * wall, battery_height - wall)
        .translate((0, 0, wall / 2))
    )
    batt_box = batt_outer.cut(batt_inner).translate((bx, by, bz))

    # Connector port
    port = (
        cq.Workplane("XY")
        .cylinder(wall + 10, 15)
        .rotate((0, 0, 0), (1, 0, 0), 90)
        .translate((bx + battery_length / 2, by, bz))
    )
    batt_box = batt_box.cut(port)

    chassis = chassis.union(batt_box)

    # === 6. Mounting Holes on Top Plate ===
    hole_area_l = chassis_length - 120
    hole_area_w = chassis_width - 120
    sx = hole_area_l / max(mount_hole_count_x - 1, 1)
    sy = hole_area_w / max(mount_hole_count_y - 1, 1)

    hole_pts = []
    for ix in range(mount_hole_count_x):
        for iy in range(mount_hole_count_y):
            hx = -hole_area_l / 2 + sx * ix
            hy = -hole_area_w / 2 + sy * iy
            hole_pts.append((hx, hy))

    if hole_pts:
        chassis = (
            chassis
            .faces(">Z").workplane()
            .pushPoints(hole_pts)
            .hole(mount_hole_diameter, plate_thickness - 2)
        )

    # === 7. Corner Gussets ===
    gusset_size = 40
    gusset_t = 5
    for wx, wy in wheel_positions:
        gx = wx * 0.7
        gy = wy * 0.7
        gusset = (
            cq.Workplane("XY")
            .box(gusset_size, gusset_t, gusset_size)
            .translate((gx, gy, z_base + gusset_size / 3))
        )
        chassis = chassis.union(gusset)

    return chassis


def gen_step(params: dict = None) -> str:
    """
    Entry point called by the generate pipeline.
    Returns the path to the generated STEP file.
    """
    if params is None:
        params = {}

    defaults = {
        "chassis_length": 1200, "chassis_width": 800, "plate_thickness": 8,
        "rail_width": 60, "rail_height": 120, "rail_thickness": 5,
        "cross_count": 3, "cross_width": 40, "cross_height": 60,
        "wheel_radius": 100, "wheel_base": 900, "wheel_track": 650,
        "axle_diameter": 20, "battery_length": 400, "battery_width": 300,
        "battery_height": 100, "battery_offset_x": 0,
        "motor_mount_width": 80, "motor_mount_height": 60,
        "motor_bolt_diameter": 8, "mount_hole_diameter": 10,
        "mount_hole_count_x": 6, "mount_hole_count_y": 4,
        "plate_fillet": 5,
    }
    defaults.update(params)

    model = build_agv_chassis(**defaults)

    output_dir = Path(__file__).parent / "output"
    output_dir.mkdir(exist_ok=True)
    step_path = str(output_dir / "agv_chassis.step")

    cq.exporters.export(model, step_path)
    return step_path


if __name__ == "__main__":
    params = {}
    output_dir = str(Path(__file__).parent / "output")

    # Parse CLI args
    i = 1
    while i < len(sys.argv):
        if sys.argv[i] == "--params" and i + 1 < len(sys.argv):
            with open(sys.argv[i + 1], "r", encoding="utf-8") as f:
                params.update(json.load(f))
            i += 2
        elif sys.argv[i] == "--output" and i + 1 < len(sys.argv):
            output_dir = sys.argv[i + 1]
            i += 2
        else:
            i += 1

    defaults = {
        "chassis_length": 1200, "chassis_width": 800, "plate_thickness": 8,
        "rail_width": 60, "rail_height": 120, "rail_thickness": 5,
        "cross_count": 3, "cross_width": 40, "cross_height": 60,
        "wheel_radius": 100, "wheel_base": 900, "wheel_track": 650,
        "axle_diameter": 20, "battery_length": 400, "battery_width": 300,
        "battery_height": 100, "battery_offset_x": 0,
        "motor_mount_width": 80, "motor_mount_height": 60,
        "motor_bolt_diameter": 8, "mount_hole_diameter": 10,
        "mount_hole_count_x": 6, "mount_hole_count_y": 4,
        "plate_fillet": 5,
    }
    defaults.update(params)

    print(f"Building AGV chassis: {defaults['chassis_length']}x{defaults['chassis_width']}mm")
    model = build_agv_chassis(**defaults)

    os.makedirs(output_dir, exist_ok=True)
    step_path = os.path.join(output_dir, "agv_chassis.step")
    cq.exporters.export(model, step_path)
    print(f"STEP: {step_path} ({os.path.getsize(step_path):,} bytes)")
