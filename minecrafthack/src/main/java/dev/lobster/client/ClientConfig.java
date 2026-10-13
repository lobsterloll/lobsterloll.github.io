package dev.lobster.client;

import java.io.IOException;
import java.io.Reader;
import java.io.Writer;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.EnumSet;
import java.util.Properties;

public final class ClientConfig {
    private final EnumSet<Module> enabled = EnumSet.of(Module.HUD);

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
    }

    public void save(Path path) throws IOException {
        Properties properties = new Properties();
        for (Module module : Module.values()) {
            properties.setProperty(module.name(), Boolean.toString(enabled(module) && module != Module.FREECAM));
        }
        Files.createDirectories(path.getParent());
        try (Writer writer = Files.newBufferedWriter(path)) {
            properties.store(writer, "Lobster Client module toggles");
        }
    }
}
