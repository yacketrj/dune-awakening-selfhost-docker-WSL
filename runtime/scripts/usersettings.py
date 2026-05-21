#!/usr/bin/env python3
from __future__ import annotations

import shutil
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
DEFAULTS_DIR = ROOT / "runtime" / "defaults"
GENERATED_DIR = ROOT / "runtime" / "generated" / "usersettings"
MAPS_DIR = GENERATED_DIR / "maps"

ENGINE_DEFAULT_PATH = DEFAULTS_DIR / "UserEngine.ini"
GAME_DEFAULT_PATH = DEFAULTS_DIR / "UserGame.ini"
ENGINE_CUSTOM_PATH = GENERATED_DIR / "UserEngine.ini"

ENGINE_FIELDS = {
    "mining_output_multiplier": ("[ConsoleVariables]", "Dune.GlobalMiningOutputMultiplier", "float"),
    "vehicle_mining_output_multiplier": ("[ConsoleVariables]", "Dune.GlobalVehicleMiningOutputMultiplier", "float"),
    "pvp_resource_multiplier": ("[ConsoleVariables]", "SecurityZones.PvpResourceMultiplier", "float"),
    "vehicle_durability_damage_multiplier": ("[ConsoleVariables]", "dw.VehicleDurabilityDamageMultiplier", "float"),
    "sandstorm_enabled": ("[ConsoleVariables]", "Sandstorm.Enabled", "bool01"),
    "sandstorm_treasure_enabled": ("[ConsoleVariables]", "Sandstorm.Treasure.Enabled", "bool01"),
    "sandworm_enabled": ("[ConsoleVariables]", "sandworm.dune.Enabled", "bool01"),
    "sandworm_collision_interaction": ("[ConsoleVariables]", "Vehicle.SandwormCollisionInteraction", "boollower"),
    "sandworm_danger_zones_enabled": ("[ConsoleVariables]", "Sandworm.SandwormDangerZonesEnabled", "boollower"),
    "sandworm_invulnerability_on_exit": ("[ConsoleVariables]", "Vehicle.SandwormInvulnerabilitySecondsOnExit", "float"),
    "sandworm_invulnerability_on_restart": ("[ConsoleVariables]", "Vehicle.SandwormInvulnerabilitySecondsOnServerRestart", "float"),
}

GAME_FIELDS = {
    "force_enable_pvp_all_partitions": ("[/Script/DuneSandbox.PvpPveSettings]", "m_bShouldForceEnablePvpOnAllPartitions", "booltitle"),
    "security_zones_enabled": ("[/Script/DuneSandbox.SecurityZonesSubsystem]", "m_bAreSecurityZonesEnabled", "booltitle"),
    "item_deterioration_rate": ("[/DeteriorationSystem.ItemDeteriorationConstants]", "UpdateRateInSeconds", "float"),
    "coriolis_auto_spawn_enabled": ("[/Script/DuneSandbox.SandStormConfig]", "m_bCoriolisAutoSpawnEnabled", "booltitle"),
    "max_landclaim_segments": ("[/Script/DuneSandbox.BuildingSettings]", "m_MaxNumLandclaimSegments", "int"),
    "building_blueprint_max_extensions": ("[/Script/DuneSandbox.BuildingSettings]", "m_BuildingBlueprintMaxExtensions", "int"),
    "base_backup_max_extensions": ("[/Script/DuneSandbox.BuildingSettings]", "m_BaseBackupMaxExtensions", "int"),
    "building_restriction_limits_enabled": ("[/Script/DuneSandbox.BuildingSettings]", "m_bBuildingRestrictionLimitsEnabled", "booltitle"),
}


def map_file_path(map_name: str) -> Path:
    return MAPS_DIR / f"{map_name}.UserGame.ini"


def ensure_parent(path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)


def effective_engine_path() -> Path:
    return ENGINE_CUSTOM_PATH if ENGINE_CUSTOM_PATH.exists() else ENGINE_DEFAULT_PATH


def effective_map_path(map_name: str) -> Path:
    candidate = map_file_path(map_name)
    return candidate if candidate.exists() else GAME_DEFAULT_PATH


def read_lines(path: Path) -> list[str]:
    return path.read_text(encoding="utf-8").splitlines()


def get_value(path: Path, section: str, key: str) -> str:
    current = None
    for raw in read_lines(path):
        line = raw.strip()
        if not line or line.startswith(";"):
            continue
        if line.startswith("[") and line.endswith("]"):
            current = line
            continue
        if current == section and "=" in line:
            candidate, value = line.split("=", 1)
            if candidate.strip() == key:
                return value.strip()
    raise KeyError(f"Could not find {key} in {path}")


def set_value(path: Path, base_path: Path, section: str, key: str, value: str) -> None:
    if not path.exists():
        ensure_parent(path)
        shutil.copyfile(base_path, path)

    lines = read_lines(path)
    current = None
    found = False
    for idx, raw in enumerate(lines):
        stripped = raw.strip()
        if stripped.startswith("[") and stripped.endswith("]"):
            current = stripped
            continue
        if current == section and "=" in stripped and not stripped.startswith(";"):
            candidate, _ = stripped.split("=", 1)
            if candidate.strip() == key:
                lines[idx] = f"{key}={value}"
                found = True
                break

    if not found:
        raise KeyError(f"Could not find {key} in {path}")

    path.write_text("\n".join(lines) + "\n", encoding="utf-8")


def normalize_value(value: str, kind: str) -> str:
    raw = value.strip()
    if raw == "/back":
        raise ValueError("cancelled")
    if raw == "":
        raise ValueError("Value is required.")
    if kind == "float":
        return str(float(raw))
    if kind == "int":
        parsed = int(raw)
        if parsed < 0:
            raise ValueError("Value must be >= 0")
        return str(parsed)
    if kind == "bool01":
        lowered = raw.lower()
        if lowered in {"1", "true", "yes", "on"}:
            return "1"
        if lowered in {"0", "false", "no", "off"}:
            return "0"
        raise ValueError("Expected 1/0 or true/false")
    if kind == "boollower":
        lowered = raw.lower()
        if lowered in {"1", "true", "yes", "on"}:
            return "true"
        if lowered in {"0", "false", "no", "off"}:
            return "false"
        raise ValueError("Expected true/false")
    if kind == "booltitle":
        lowered = raw.lower()
        if lowered in {"1", "true", "yes", "on"}:
            return "True"
        if lowered in {"0", "false", "no", "off"}:
            return "False"
        raise ValueError("Expected True/False")
    raise ValueError(f"Unsupported type: {kind}")


def print_values(path: Path, fields: dict[str, tuple[str, str, str]]) -> None:
    for field_id, (section, key, _kind) in fields.items():
        print(f"{field_id}\t{get_value(path, section, key)}")


def materialize(map_name: str, saved_dir: str) -> None:
    user_settings_dir = Path(saved_dir) / "UserSettings"
    user_settings_dir.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(effective_engine_path(), user_settings_dir / "UserEngine.ini")
    shutil.copyfile(effective_map_path(map_name), user_settings_dir / "UserGame.ini")


def reset_all() -> None:
    if GENERATED_DIR.exists():
        shutil.rmtree(GENERATED_DIR)


def usage() -> int:
    print(
        "Usage:\n"
        "  usersettings.py engine-values\n"
        "  usersettings.py engine-set <field-id> <value>\n"
        "  usersettings.py map-values <map-name>\n"
        "  usersettings.py map-set <map-name> <field-id> <value>\n"
        "  usersettings.py materialize <map-name> <saved-dir>\n"
        "  usersettings.py reset-all"
    )
    return 2


def main(argv: list[str]) -> int:
    if len(argv) < 2:
        return usage()

    cmd = argv[1]
    if cmd == "engine-values":
        print_values(effective_engine_path(), ENGINE_FIELDS)
        return 0
    if cmd == "engine-set" and len(argv) == 4:
        field = ENGINE_FIELDS.get(argv[2])
        if field is None:
            print(f"Unknown engine field: {argv[2]}", file=sys.stderr)
            return 1
        section, key, kind = field
        try:
            value = normalize_value(argv[3], kind)
        except ValueError as exc:
            if str(exc) == "cancelled":
                print("No changes made.")
                return 0
            print(str(exc), file=sys.stderr)
            return 1
        set_value(ENGINE_CUSTOM_PATH, ENGINE_DEFAULT_PATH, section, key, value)
        return 0
    if cmd == "map-values" and len(argv) == 3:
        print_values(effective_map_path(argv[2]), GAME_FIELDS)
        return 0
    if cmd == "map-set" and len(argv) == 5:
        field = GAME_FIELDS.get(argv[3])
        if field is None:
            print(f"Unknown map field: {argv[3]}", file=sys.stderr)
            return 1
        section, key, kind = field
        try:
            value = normalize_value(argv[4], kind)
        except ValueError as exc:
            if str(exc) == "cancelled":
                print("No changes made.")
                return 0
            print(str(exc), file=sys.stderr)
            return 1
        set_value(map_file_path(argv[2]), GAME_DEFAULT_PATH, section, key, value)
        return 0
    if cmd == "materialize" and len(argv) == 4:
        materialize(argv[2], argv[3])
        return 0
    if cmd == "reset-all" and len(argv) == 2:
        reset_all()
        return 0

    return usage()


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
