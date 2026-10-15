package dev.lobster.client;

import java.io.IOException;
import java.io.Reader;
import java.io.Writer;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.EnumSet;
import java.util.HashSet;
import java.util.Properties;
import java.util.Set;
import java.util.stream.Collectors;

public final class ClientConfig {
    public enum FoodPriority { COMBINED, HUNGER, SATURATION }
    public enum EatThreshold { HEALTH, HUNGER, ANY, BOTH }
    public enum ExpMode { ARMOR, HANDS, BOTH }

    private final EnumSet<Module> enabled = EnumSet.of(Module.HUD);
    final Set<String> autoEatBlacklist = new HashSet<>(Set.of("minecraft:enchanted_golden_apple", "minecraft:golden_apple",
        "minecraft:chorus_fruit", "minecraft:poisonous_potato", "minecraft:pufferfish", "minecraft:chicken",
        "minecraft:rotten_flesh", "minecraft:spider_eye", "minecraft:suspicious_stew"));
    FoodPriority autoEatPriority = FoodPriority.SATURATION;
    EatThreshold autoEatThreshold = EatThreshold.ANY;
    int autoEatHunger = 16;
    double autoEatHealth = 10;
    boolean autoEatSearchInventory;
    boolean autoEatPauseAuras = true;
    ExpMode autoExpMode = ExpMode.BOTH;
    boolean autoExpReplenish = true;
    boolean autoExpOnlyGround;
    int autoExpSlot = 6;
    int autoExpMinThreshold = 30;
    int autoExpMaxThreshold = 80;

    public boolean enabled(Module module) {
        return enabled.contains(module);
    }

    public void toggle(Module module) {
        if (!enabled.remove(module)) {
            enabled.add(module);
        }
    }

    public void disableAll() {
        enabled.clear();
    }

    public void load(Path path) throws IOException {
        if (!Files.exists(path)) {
            return;
        }
        Properties properties = new Properties();
        try (Reader reader = Files.newBufferedReader(path)) {
            properties.load(reader);
        }
        enabled.clear();
        for (Module module : Module.values()) {
            // Camera state belongs to the current world and cannot survive a restart.
            if (module != Module.FREECAM && Boolean.parseBoolean(properties.getProperty(module.name(), "false"))) {
                enabled.add(module);
            }
        }
        try {
            autoEatPriority = FoodPriority.valueOf(properties.getProperty("autoEat.priority", autoEatPriority.name()));
            autoEatThreshold = EatThreshold.valueOf(properties.getProperty("autoEat.threshold", autoEatThreshold.name()));
            autoEatHunger = Math.clamp(Integer.parseInt(properties.getProperty("autoEat.hunger", "16")), 1, 19);
            autoEatHealth = Math.clamp(Double.parseDouble(properties.getProperty("autoEat.health", "10")), 1, 19);
        } catch (IllegalArgumentException ignored) {
            // Keep defaults for invalid settings.
        }
        autoEatSearchInventory = Boolean.parseBoolean(properties.getProperty("autoEat.searchInventory", "false"));
        autoEatPauseAuras = Boolean.parseBoolean(properties.getProperty("autoEat.pauseAuras", "true"));
        try {
            autoExpMode = ExpMode.valueOf(properties.getProperty("autoExp.mode", autoExpMode.name()));
            autoExpSlot = Math.clamp(Integer.parseInt(properties.getProperty("autoExp.slot", "6")), 1, 9);
            autoExpMinThreshold = Math.clamp(Integer.parseInt(properties.getProperty("autoExp.minThreshold", "30")), 1, 100);
            autoExpMaxThreshold = Math.clamp(Integer.parseInt(properties.getProperty("autoExp.maxThreshold", "80")), 1, 100);
        } catch (IllegalArgumentException ignored) {
            // Keep defaults for invalid settings.
        }
        autoExpReplenish = Boolean.parseBoolean(properties.getProperty("autoExp.replenish", "true"));
        autoExpOnlyGround = Boolean.parseBoolean(properties.getProperty("autoExp.onlyGround", "false"));
        if (properties.containsKey("autoEat.blacklist")) {
            autoEatBlacklist.clear();
            for (String name : properties.getProperty("autoEat.blacklist").split(",")) {
                if (!name.isBlank()) {
                    autoEatBlacklist.add(name.trim());
                }
            }
        }
    }

    public void save(Path path) throws IOException {
        Properties properties = new Properties();
        for (Module module : Module.values()) {
            properties.setProperty(module.name(), Boolean.toString(enabled(module) && module != Module.FREECAM));
        }
        properties.setProperty("autoEat.priority", autoEatPriority.name());
        properties.setProperty("autoEat.threshold", autoEatThreshold.name());
        properties.setProperty("autoEat.hunger", Integer.toString(autoEatHunger));
        properties.setProperty("autoEat.health", Double.toString(autoEatHealth));
        properties.setProperty("autoEat.searchInventory", Boolean.toString(autoEatSearchInventory));
        properties.setProperty("autoEat.pauseAuras", Boolean.toString(autoEatPauseAuras));
        properties.setProperty("autoEat.blacklist", autoEatBlacklist.stream().sorted().collect(Collectors.joining(",")));
        properties.setProperty("autoExp.mode", autoExpMode.name());
        properties.setProperty("autoExp.replenish", Boolean.toString(autoExpReplenish));
        properties.setProperty("autoExp.onlyGround", Boolean.toString(autoExpOnlyGround));
        properties.setProperty("autoExp.slot", Integer.toString(autoExpSlot));
        properties.setProperty("autoExp.minThreshold", Integer.toString(autoExpMinThreshold));
        properties.setProperty("autoExp.maxThreshold", Integer.toString(autoExpMaxThreshold));
        Files.createDirectories(path.getParent());
        try (Writer writer = Files.newBufferedWriter(path)) {
            properties.store(writer, "Lobster Client module toggles");
        }
    }
}
