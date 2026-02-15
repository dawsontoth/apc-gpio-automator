export const OIDS = {
    RPDU2: {
        names: '.1.3.6.1.4.1.318.1.1.12.3.5.1.1.2',
        control: '.1.3.6.1.4.1.318.1.1.12.3.3.1.1.4',
        status: '.1.3.6.1.4.1.318.1.1.12.3.3.1.1.4'
    },
    RPDU: {
        names: '.1.3.6.1.4.1.318.1.1.4.4.2.1.4',
        control: '.1.3.6.1.4.1.318.1.1.4.4.2.1.3',
        status: '.1.3.6.1.4.1.318.1.1.4.4.2.1.3'
    },
    TRAPS: {
        RPDU2: {
            outletStateChanged: '.1.3.6.1.4.1.318.0.210',
            powerThresholdViolation: '.1.3.6.1.4.1.318.0.203',
            loadThresholdViolation: '.1.3.6.1.4.1.318.0.202'
        },
        RPDU: {
            outletStatus: '.1.3.6.1.4.1.318.0.5',
            loadThresholdViolation: '.1.3.6.1.4.1.318.0.6'
        }
    },
    sysName: '.1.3.6.1.2.1.1.5.0',
    sysLocation: '.1.3.6.1.2.1.1.6.0',
    sysDescr: '.1.3.6.1.2.1.1.1.0'
};
