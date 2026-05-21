    export namespace notifications {
        export interface NotificationButton {
            /** @deprecated since Chrome 59. Button icons not visible for Mac OS X users. */
            iconUrl?: string;
            title: string;
        }

        export interface NotificationItem {
            /** Additional details about this item. */
            message: string;
            /** Title of one item of a list notification. */
            title: string;
        }

        export interface NotificationOptions {
            /**
             * A URL to the app icon mask. URLs have the same restrictions as {@link notifications.NotificationOptions.iconUrl iconUrl}.
             *
             * The app icon mask should be in alpha channel, as only the alpha channel of the image will be considered.
             * @deprecated since Chrome 59. The app icon mask is not visible for Mac OS X users.
             */
            appIconMaskUrl?: string;
            /** Text and icons for up to two notification action buttons. */
            buttons?: NotificationButton[];
            /** Alternate notification content with a lower-weight font. */
            contextMessage?: string;
            /** A timestamp associated with the notification, in milliseconds past the epoch (e.g. `Date.now() + n`). */
            eventTime?: number;
            /**
             * A URL to the sender's avatar, app icon, or a thumbnail for image notifications.
             *
             * URLs can be a data URL, a blob URL, or a URL relative to a resource within this extension's .crx file
             *
             * **Note:** This value is required for the {@link notifications.create}() method.
             */
            iconUrl?: string;
            /**
             * A URL to the image thumbnail for image-type notifications. URLs have the same restrictions as {@link notifications.NotificationOptions.iconUrl iconUrl}.
             * @deprecated since Chrome 59. The image is not visible for Mac OS X users.
             */
            imageUrl?: string;
            /** @deprecated since Chrome 67. This UI hint is ignored as of Chrome 67 */
            isClickable?: boolean;
            /** Items for multi-item notifications. Users on Mac OS X only see the first item. */
            items?: NotificationItem[];
            /**
             * Main notification content.
             *
             * **Note:** This value is required for the {@link notifications.create}() method.
             */
            message?: string;
            /** Priority ranges from -2 to 2. -2 is lowest priority. 2 is highest. Zero is default. On platforms that don't support a notification center (Windows, Linux & Mac), -2 and -1 result in an error as notifications with those priorities will not be shown at all. */
            priority?: number;
            /** Current progress ranges from 0 to 100. */
            progress?: number;
            /**
             * Indicates that the notification should remain visible on screen until the user activates or dismisses the notification. This defaults to false.
             * @since Chrome 50
             */
            requireInteraction?: boolean;
            /**
             * Indicates that no sounds or vibrations should be made when the notification is being shown. This defaults to false.
             * @since Chrome 70
             */
            silent?: boolean;
            /**
             * Title of the notification (e.g. sender name for email).
             *
             * **Note:** This value is required for the {@link notifications.create}() method.
             */
            title?: string;
            /** Which type of notification to display.
             *
             * **Note:** This value is required for the {@link notifications.create}() method.
             */
            type?: `${TemplateType}`;
        }

        type NotificationCreateOptions = SetRequired<NotificationOptions, "type" | "title" | "message" | "iconUrl">;

        export enum PermissionLevel {
            /** Specifies that the user has elected to show notifications from the app or extension. This is the default at install time. */
            GRANTED = "granted",
            /** Specifies that the user has elected not to show notifications from the app or extension. */
            DENIED = "denied",
        }

        export enum TemplateType {
            /** Contains an icon, title, message, expandedMessage, and up to two buttons. */
            BASIC = "basic",
            /** Contains an icon, title, message, expandedMessage, image, and up to two buttons. */
            IMAGE = "image",
            /** Contains an icon, title, message, items, and up to two buttons. Users on Mac OS X only see the first item. */
            LIST = "list",
            /** Contains an icon, title, message, progress, and up to two buttons. */
            PROGRESS = "progress",
        }

        /**
         * Clears the specified notification.
         * @param notificationId The id of the notification to be cleared. This is returned by {@link notifications.create} method.
         *
         * Can return its result via Promise since Chrome 116
         */
        export function clear(notificationId: string): Promise<boolean>;
        export function clear(notificationId: string, callback: (wasCleared: boolean) => void): void;

        /**
         * Creates and displays a notification.
         * @param notificationId Identifier of the notification. If not set or empty, an ID will automatically be generated. If it matches an existing notification, this method first clears that notification before proceeding with the create operation. The identifier may not be longer than 500 characters.
         *
         * The `notificationId` parameter is required before Chrome 42.
         * @param options Contents of the notification.
         *
         * Can return its result via Promise since Chrome 116
         */
        export function create(notificationId: string, options: NotificationCreateOptions): Promise<string>;
        export function create(options: NotificationCreateOptions): Promise<string>;
        export function create(
            notificationId: string,
            options: NotificationCreateOptions,
            callback: (notificationId: string) => void,
        ): void;
        export function create(options: NotificationCreateOptions, callback: (notificationId: string) => void): void;

        /**
         * Retrieves all the notifications of this app or extension.
         *
         * Can return its result via Promise since Chrome 116
         */
        export function getAll(): Promise<{ [key: string]: true }>;
        export function getAll(callback: (notifications: { [key: string]: true }) => void): void;

        /**
         * Retrieves whether the user has enabled notifications from this app or extension.
         *
         * Can return its result via Promise since Chrome 116
         */
        export function getPermissionLevel(): Promise<`${PermissionLevel}`>;
        export function getPermissionLevel(callback: (level: `${PermissionLevel}`) => void): void;

        /**
         * Updates an existing notification.
         * @param notificationId The id of the notification to be updated. This is returned by {@link notifications.create} method.
         * @param options Contents of the notification to update to.
         *
         * Can return its result via Promise since Chrome 116
         */
        export function update(notificationId: string, options: NotificationOptions): Promise<boolean>;
        export function update(
            notificationId: string,
            options: NotificationOptions,
            callback: (wasUpdated: boolean) => void,
        ): void;

        /** The user pressed a button in the notification. */
        export const onButtonClicked: events.Event<(notificationId: string, buttonIndex: number) => void>;

        /** The user clicked in a non-button area of the notification. */
        export const onClicked: events.Event<(notificationId: string) => void>;

        /** The notification closed, either by the system or by user action. */
        export const onClosed: events.Event<(notificationId: string, byUser: boolean) => void>;

        /** The user changes the permission level. As of Chrome 47, only ChromeOS has UI that dispatches this event. */
        export const onPermissionLevelChanged: events.Event<(level: `${PermissionLevel}`) => void>;

        /**
         * The user clicked on a link for the app's notification settings. As of Chrome 47, only ChromeOS has UI that dispatches this event. As of Chrome 65, that UI has been removed from ChromeOS, too.
         * @deprecated since Chrome 65. Custom notification settings button is no longer supported.
         */
        export const onShowSettings: events.Event<() => void>;
    }


notifications: Notifications.Static & {
resetState(): void;
onClosed: EventForTesting<[notificationId: string, byUser: boolean]>;
onClicked: EventForTesting<[notificationId: string]>;
onButtonClicked: EventForTesting<[notificationId: string, buttonIndex: number]>;
onShown: EventForTesting<[notificationId: string]>;
};