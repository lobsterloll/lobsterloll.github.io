package dev.lobster.client;

public enum Module {
    FULLBRIGHT("Fullbright", "Visual", "Brightens dark areas without changing world lighting."),
    ESP("ESP", "Visual", "Outlines nearby mobs and players through walls."),
    ORE_LOCATOR("Ore Locator", "Visual", "Marks nearest ores in loaded chunks within 500 horizontal blocks."),
    FREECAM("Freecam", "Visual", "Detached camera. WASD, jump and sneak to move."),
    AUTO_SPRINT("Auto Sprint", "Movement", "Sprints while moving forward when hunger allows."),
    SPEED("Faster Sprint", "Movement", "Boosts horizontal sprint speed. Server dependent."),
    FLIGHT("Flight", "Movement", "WASD, jump and sneak flight. Server dependent."),
    WATER_WALK("Water Walk", "Movement", "Stay on the water surface; jump with Space, sneak to dive. Server dependent."),
    NO_FALL("No Fall", "Movement", "Sends grounded movement while falling. Server dependent."),
    VEINMINER("Veinminer", "World", "Break one ore to mine its vein instantly with the server mod, or automatically at normal speed elsewhere."),
    KILL_AURA("Kill Aura", "Combat", "Automatically attacks the nearest mob/player in the held weapon's reach from any direction at 85% cooldown."),
    HITBOX("Hitbox Increase", "Combat", "Adds 4 blocks to mob/player attack targeting. Full reach needs the server mod."),
    HUD("HUD", "Visual", "Shows your coordinates, enabled modules and ore markers.");

    public final String label;
    public final String category;
    public final String description;

    Module(String label, String category, String description) {
        this.label = label;
        this.category = category;
        this.description = description;
    }
}
