package dev.lobster.client;

public enum Module {
    FULLBRIGHT("Fullbright", "Visual", "Brightens dark areas without changing world lighting."),
    ESP("ESP", "Visual", "Outlines nearby mobs and players through walls."),
    ORE_LOCATOR("Ore Locator", "Visual", "Lists nearest ores in loaded chunks within 24 blocks."),
    FREECAM("Freecam", "Visual", "Detached camera. WASD, jump and sneak to move."),
    AUTO_SPRINT("Auto Sprint", "Movement", "Sprints while moving forward when hunger allows."),
    SPEED("Faster Sprint", "Movement", "Boosts horizontal sprint speed. Server dependent."),
    FLIGHT("Flight", "Movement", "WASD, jump and sneak flight. Server dependent."),
    WATER_WALK("Water Walk", "Movement", "Stay on the water surface; sneak to dive. Server dependent."),
    NO_FALL("No Fall", "Movement", "Sends grounded movement while falling. Server dependent."),
    VEINMINER("Veinminer", "World", "Hold attack on ore to mine connected blocks within reach."),
    KILL_AURA("Kill Aura", "Combat", "Attacks the nearest mob/player in reach at full cooldown."),
    HITBOX("Hitbox Increase", "Combat", "Expands client targeting boxes by 0.35 blocks. Server dependent."),
    HUD("HUD", "Visual", "Shows coordinates, enabled modules and nearby ores.");

    public final String label;
    public final String category;
    public final String description;

    Module(String label, String category, String description) {
        this.label = label;
        this.category = category;
        this.description = description;
    }
}
