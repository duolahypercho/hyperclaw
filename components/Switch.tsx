// IOSSwitch.tsx
import React from 'react';

interface IOSSwitchProps {
    checked: boolean;
    onChange: (checked: boolean) => void;
}

const IOSSwitch: React.FC<IOSSwitchProps> = ({ checked, onChange }) => {
    const toggleSwitch = () => onChange(!checked);

    return (
        <div className={`ios-switch ${checked ? 'checked' : ''}`} onClick={toggleSwitch}>
            <div className="switch-thumb"></div>
        </div>
    );
};

export default IOSSwitch;
