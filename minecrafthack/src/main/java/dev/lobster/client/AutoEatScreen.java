package dev.lobster.client;

import java.util.Comparator;
import java.util.List;
import net.minecraft.client.KeyMapping;
import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.GuiGraphicsExtractor;
import net.minecraft.client.gui.components.Button;
import net.minecraft.client.gui.components.Tooltip;
import net.minecraft.client.gui.screens.Screen;
import net.minecraft.client.input.KeyEvent;
import net.minecraft.core.component.DataComponents;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.network.chat.Component;
import net.minecraft.world.item.Item;

public final class AutoEatScreen extends Screen {
    private final Screen parent;

    public AutoEatScreen(Screen parent) {
        super(Component.literal("Auto Eat"));
        this.parent = parent;
    }

    @Override
    protected void init() {
        ClientConfig config = LobsterClient.CONFIG;
        int buttonWidth = Math.min(220, (width - 36) / 2);
        int left = width / 2 - buttonWidth - 6;
        int right = left + buttonWidth + 12;
        int top = Math.max(42, height / 2 - 82);
        Button priority = Button.builder(Component.literal("Priority: " + config.autoEatPriority), button -> {
            var values = ClientConfig.FoodPriority.values();
            config.autoEatPriority = values[(config.autoEatPriority.ordinal() + 1) % values.length];
            button.setMessage(Component.literal("Priority: " + config.autoEatPriority));
            LobsterClient.save();
        }).bounds(left, top, buttonWidth, 20).build();
        priority.setTooltip(Tooltip.create(Component.literal("Choose by saturation, hunger restored, or both combined.")));
        addRenderableWidget(priority);
        Button threshold = Button.builder(Component.literal("Trigger: " + config.autoEatThreshold), button -> {
            var values = ClientConfig.EatThreshold.values();
            config.autoEatThreshold = values[(config.autoEatThreshold.ordinal() + 1) % values.length];
            button.setMessage(Component.literal("Trigger: " + config.autoEatThreshold));
            LobsterClient.save();
        }).bounds(right, top, buttonWidth, 20).build();
        threshold.setTooltip(Tooltip.create(Component.literal("Any means low health or hunger; Both requires both.")));
        addRenderableWidget(threshold);

        addRenderableWidget(Button.builder(Component.literal("Hunger: " + config.autoEatHunger + "  -"), button -> {
            config.autoEatHunger = Math.max(1, config.autoEatHunger - 1);
            rebuildWidgets();
            LobsterClient.save();
        }).bounds(left, top + 25, buttonWidth, 20).build());
        addRenderableWidget(Button.builder(Component.literal("Hunger: " + config.autoEatHunger + "  +"), button -> {
            config.autoEatHunger = Math.min(19, config.autoEatHunger + 1);
            rebuildWidgets();
            LobsterClient.save();
        }).bounds(right, top + 25, buttonWidth, 20).build());
        addRenderableWidget(Button.builder(Component.literal("Health: " + (int) config.autoEatHealth + "  -"), button -> {
            config.autoEatHealth = Math.max(1, config.autoEatHealth - 1);
            rebuildWidgets();
            LobsterClient.save();
        }).bounds(left, top + 50, buttonWidth, 20).build());
        addRenderableWidget(Button.builder(Component.literal("Health: " + (int) config.autoEatHealth + "  +"), button -> {
            config.autoEatHealth = Math.min(19, config.autoEatHealth + 1);
            rebuildWidgets();
            LobsterClient.save();
        }).bounds(right, top + 50, buttonWidth, 20).build());
        addRenderableWidget(Button.builder(Component.literal("Search inventory: " + (config.autoEatSearchInventory ? "ON" : "OFF")), button -> {
            config.autoEatSearchInventory = !config.autoEatSearchInventory;
            rebuildWidgets();
            LobsterClient.save();
        }).bounds(left, top + 75, buttonWidth, 20).build());
        addRenderableWidget(Button.builder(Component.literal("Pause Kill Aura: " + (config.autoEatPauseAuras ? "ON" : "OFF")), button -> {
            config.autoEatPauseAuras = !config.autoEatPauseAuras;
            rebuildWidgets();
            LobsterClient.save();
        }).bounds(right, top + 75, buttonWidth, 20).build());
        addRenderableWidget(Button.builder(Component.literal("Food blacklist (" + config.autoEatBlacklist.size() + ")"), button ->
            Minecraft.getInstance().gui.setScreen(new BlacklistScreen(this)))
            .bounds(left, top + 100, buttonWidth, 20).build());
        addRenderableWidget(Button.builder(Component.literal("Done"), button -> onClose())
            .bounds(right, top + 100, buttonWidth, 20).build());
    }

    @Override
    public void extractRenderState(GuiGraphicsExtractor graphics, int mouseX, int mouseY, float partialTick) {
        graphics.fill(0, 0, width, height, 0xE8111720);
        graphics.centeredText(font, "AUTO EAT", width / 2, 12, 0xFFFF8A70);
        super.extractRenderState(graphics, mouseX, mouseY, partialTick);
    }

    @Override
    public boolean keyPressed(KeyEvent event) {
        if (KeyMapping.get("key.lobster_client.menu").matches(event)) {
            onClose();
            return true;
        }
        return super.keyPressed(event);
    }

    @Override
    public void onClose() {
        Minecraft.getInstance().gui.setScreen(parent);
    }

    @Override
    public boolean isPauseScreen() {
        return false;
    }

    private static final class BlacklistScreen extends Screen {
        private final AutoEatScreen parent;
        private final List<Item> foods = BuiltInRegistries.ITEM.stream()
            .filter(item -> item.getDefaultInstance().has(DataComponents.FOOD)
                && item.getDefaultInstance().has(DataComponents.CONSUMABLE))
            .sorted(Comparator.comparing(item -> BuiltInRegistries.ITEM.getKey(item).toString()))
            .toList();
        private int page;

        private BlacklistScreen(AutoEatScreen parent) {
            super(Component.literal("Auto Eat Blacklist"));
            this.parent = parent;
        }

        @Override
        protected void init() {
            int buttonWidth = Math.min(220, (width - 36) / 2);
            int left = width / 2 - buttonWidth - 6;
            int top = Math.max(42, height / 2 - 90);
            for (int i = page * 12; i < Math.min(foods.size(), (page + 1) * 12); i++) {
                Item item = foods.get(i);
                String itemId = BuiltInRegistries.ITEM.getKey(item).toString();
                int index = i % 12;
                Button button = Button.builder(label(item), clicked -> {
                    if (!LobsterClient.CONFIG.autoEatBlacklist.remove(itemId)) {
                        LobsterClient.CONFIG.autoEatBlacklist.add(itemId);
                    }
                    clicked.setMessage(label(item));
                    LobsterClient.save();
                }).bounds(left + (index % 2) * (buttonWidth + 12), top + (index / 2) * 22,
                    buttonWidth, 20).build();
                button.setTooltip(Tooltip.create(Component.literal(BuiltInRegistries.ITEM.getKey(item).toString())));
                addRenderableWidget(button);
            }
            if (page > 0) {
                addRenderableWidget(Button.builder(Component.literal("Previous"), button -> {
                    page--;
                    rebuildWidgets();
                }).bounds(left, top + 138, buttonWidth, 20).build());
            }
            if ((page + 1) * 12 < foods.size()) {
                addRenderableWidget(Button.builder(Component.literal("Next"), button -> {
                    page++;
                    rebuildWidgets();
                }).bounds(left + buttonWidth + 12, top + 138, buttonWidth, 20).build());
            }
            addRenderableWidget(Button.builder(Component.literal("Done"), button -> onClose())
                .bounds(width / 2 - buttonWidth / 2, top + 163, buttonWidth, 20).build());
        }

        private Component label(Item item) {
            String name = item.getDefaultInstance().getHoverName().getString();
            String itemId = BuiltInRegistries.ITEM.getKey(item).toString();
            return Component.literal((LobsterClient.CONFIG.autoEatBlacklist.contains(itemId) ? "[BLOCK] " : "[EAT] ") + name);
        }

        @Override
        public void extractRenderState(GuiGraphicsExtractor graphics, int mouseX, int mouseY, float partialTick) {
            graphics.fill(0, 0, width, height, 0xE8111720);
            graphics.centeredText(font, "AUTO EAT BLACKLIST  " + (page + 1) + "/" + ((foods.size() + 11) / 12),
                width / 2, 12, 0xFFFF8A70);
            super.extractRenderState(graphics, mouseX, mouseY, partialTick);
        }

        @Override
        public void onClose() {
            Minecraft.getInstance().gui.setScreen(parent);
        }

        @Override
        public boolean isPauseScreen() {
            return false;
        }
    }
}
